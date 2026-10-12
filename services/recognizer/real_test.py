"""Round 2: does recognition hold for YOUR music? Real songs, real posts.

Put the songs you have the rights to in one folder (any audio or video file
ffmpeg reads; the file name without extension is the song's name) and the
posts in another. Say which song each post uses, either

  - in the post's file name: `<song name>__anything.mp4`, or `none__x.mp4`
    for a post that uses no song of the catalogue, or
  - in a CSV file (`--labels labels.csv`) with the columns `post,song`
    (song empty or `none` for no catalogue song).

    python3 services/recognizer/real_test.py SONGS_DIR [POSTS_DIR] [--labels FILE]
                                             [--edits] [--voice FILE] [--json FILE]

`--edits` also cuts TikTok-style posts from every song itself (sped up,
slowed, pitched, compressed, noisy, only 20 s from the middle; with
`--voice`, a voice-over on top) and runs them twice: with the song in the
catalogue (it should be found) and without it (nothing should be found:
the check for false matches on real music). Works without any real post.

Prints one line per post with the app's decision (`decide.py`, the same rule
as the app), a summary and threshold suggestions for the app's environment
(`RECOGNITION_MATCH_RATIO` and friends). Nothing leaves the computer.

Needs: Python 3.11+, numpy, scipy (requirements.txt), ffmpeg.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bekvor_fp as fp  # noqa: E402
from decide import DEFAULTS, decide  # noqa: E402

MEDIA = {".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus", ".mp4", ".mov", ".webm", ".mkv", ".aiff", ".aif"}
SONG_SECONDS = 20 * 60
POST_SECONDS = 10 * 60


@dataclass
class Case:
    post: str
    expected: str | None  # song name, or None: no catalogue song
    kind: str  # "post" | "edit" | "edit, song not in catalogue"
    outcome: str = ""
    found: str | None = None
    ratio: float = 0.0
    score: float = 0.0
    melody: float | None = None
    window_share: float = 0.0
    seconds: float = 0.0
    extra: dict = field(default_factory=dict)

    @property
    def verdict(self) -> str:
        if self.expected is None:
            return {"MATCH": "FALSE MATCH", "CANDIDATE": "false suggestion", "NO_MATCH": "ok"}[self.outcome]
        if self.outcome == "NO_MATCH":
            return "missed"
        if self.found != self.expected:
            return "WRONG SONG" if self.outcome == "MATCH" else "wrong suggestion"
        return "ok" if self.outcome == "MATCH" else "suggested (person confirms)"


def media_files(folder: str) -> list[str]:
    return sorted(
        os.path.join(folder, name)
        for name in os.listdir(folder)
        if os.path.splitext(name)[1].lower() in MEDIA and not name.startswith(".")
    )


def stem(path: str) -> str:
    return os.path.splitext(os.path.basename(path))[0]


def read_audio(path: str, seconds: float) -> np.ndarray:
    with open(path, "rb") as f:
        return fp.decode(f.read(), seconds)


def labels_from(posts: list[str], labels_file: str | None, songs: set[str]) -> dict[str, str | None]:
    labels: dict[str, str | None] = {}
    if labels_file:
        with open(labels_file, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                song = (row.get("song") or "").strip()
                labels[(row.get("post") or "").strip()] = None if song.lower() in ("", "none") else song
    out: dict[str, str | None] = {}
    for post in posts:
        name = os.path.basename(post)
        if name in labels or stem(name) in labels:
            out[post] = labels.get(name, labels.get(stem(name)))
        elif "__" in name:
            prefix = name.split("__", 1)[0]
            out[post] = None if prefix.lower() == "none" else prefix
        else:
            raise SystemExit(f"No label for {name}: name it '<song>__{name}' or 'none__{name}', or list it in --labels.")
        if out[post] is not None and out[post] not in songs:
            raise SystemExit(f"{name} is labelled '{out[post]}', but there's no song file with that name.")
    return out


def ffmpeg(y: np.ndarray, filters: str | None = None, codec: str | None = None) -> np.ndarray:
    """Runs audio at fp.FS through an ffmpeg filter and/or a lossy codec."""
    with tempfile.TemporaryDirectory(prefix="bekvor-edit-") as tmp:
        mid = os.path.join(tmp, "mid.m4a")
        pcm = (np.clip(y, -1, 1) * 32767).astype("<i2").tobytes()
        cmd = ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(fp.FS), "-ac", "1", "-i", "pipe:0"]
        if filters:
            cmd += ["-af", filters]
        if codec == "aac":
            subprocess.run(cmd + ["-c:a", "aac", "-b:a", "64k", mid], input=pcm, check=True)
            out = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", mid, "-ac", "1", "-ar", str(fp.FS), "-f", "s16le", "pipe:1"], capture_output=True, check=True).stdout
        else:
            out = subprocess.run(cmd + ["-ac", "1", "-ar", str(fp.FS), "-f", "s16le", "pipe:1"], input=pcm, capture_output=True, check=True).stdout
        return np.frombuffer(out, dtype="<i2").astype(np.float32) / 32768.0


def mix(music: np.ndarray, other: np.ndarray, music_db: float) -> np.ndarray:
    """Music `music_db` dB relative to `other` (negative: music quieter)."""
    other = np.resize(other, len(music))
    rm, ro = np.sqrt(np.mean(music**2)) + 1e-9, np.sqrt(np.mean(other**2)) + 1e-9
    out = music / rm * 10 ** (music_db / 20) + other / ro
    return (out / (np.abs(out).max() + 1e-9) * 0.9).astype(np.float32)


def edits(song: np.ndarray, seed: int, voice: np.ndarray | None) -> dict[str, np.ndarray]:
    rng = np.random.default_rng(seed)
    n = len(song)
    clip_len = min(n, int(30 * fp.FS))
    start = int(rng.integers(0, max(1, n - clip_len)))
    clip = song[start : start + clip_len]
    mid = song[max(0, n // 2 - 10 * fp.FS) : n // 2 + 10 * fp.FS]
    noise = rng.standard_normal(len(clip)).astype(np.float32)
    rate = fp.FS
    out = {
        "30 s clip": clip,
        "20 s from the middle": mid,
        "aac 64k": ffmpeg(clip, codec="aac"),
        "noise (music +10 dB)": mix(clip, noise, 10),
        "sped up 1.25x": ffmpeg(clip, f"asetrate={int(rate * 1.25)},aresample={rate}"),
        "slowed 0.85x": ffmpeg(clip, f"asetrate={int(rate * 0.85)},aresample={rate}"),
        "phone (300-3500 Hz) + aac": ffmpeg(clip, "highpass=f=300,lowpass=f=3500", "aac"),
    }
    if voice is not None:
        out["voice-over (music -6 dB)"] = mix(clip, voice, -6)
        out["voice-over (music -12 dB)"] = mix(clip, voice, -12)
        out["1.2x + voice + aac"] = ffmpeg(mix(ffmpeg(clip, f"asetrate={int(rate * 1.2)},aresample={rate}"), voice, -9), None, "aac")
    return out


def run(case: Case, index: fp.Index, y: np.ndarray, thresholds: dict) -> Case:
    t0 = time.time()
    result = fp.match(index, y)
    case.seconds = time.time() - t0
    decision = decide(result, thresholds)
    case.outcome, case.found, case.ratio, case.score = decision["outcome"], decision["trackId"], decision["ratio"], decision["score"]
    top = (result.get("candidates") or [None])[0]
    if top:
        case.melody = top.get("melodyAgreement")
        case.window_share = top["windowsWon"] / result["windows"] if result.get("windows") else 0.0
        case.extra = {"speed": top.get("speed"), "pitch": top.get("pitchSemitones"), "topSong": top["trackId"]}
    return case


def suggest(cases: list[Case], thresholds: dict) -> list[str]:
    """Thresholds where no post without a catalogue song (or with another
    song on top) would be matched, and how many right ones that keeps. A wrong
    song is only matched when both its ratio and its score pass, so the ratio
    is checked among the wrong ones that reach the minimum score."""
    right = [c for c in cases if c.expected is not None and c.extra.get("topSong") == c.expected]
    wrong = [c for c in cases if c.extra.get("topSong") is not None and c.extra.get("topSong") != c.expected]
    lines = []
    if not any(c.expected is None for c in cases):
        lines.append("No post without a catalogue song was tested: add some (none__*.mp4, or --edits) before changing thresholds.")
        return lines
    if not wrong:
        lines.append("No wrong song ever came out on top: the defaults are safe for this music.")
        return lines
    worst_score = max(c.score for c in wrong)
    scoring = [c for c in wrong if c.score >= thresholds["minScore"]]
    worst = max((c.ratio for c in scoring), default=0.0)
    lines.append(f"Wrong songs on top: {len(wrong)}; highest score {worst_score:.0f} (minimum {thresholds['minScore']:.0f}); highest ratio among those above the minimum: {worst:.2f}")
    match_ratio = max(DEFAULTS["matchRatio"], round(worst * 1.25 + 0.05, 1))
    candidate_ratio = min(max(DEFAULTS["candidateRatio"], round(worst * 1.05 + 0.05, 1)), match_ratio)
    kept = sum(c.ratio >= match_ratio and c.score >= thresholds["minScore"] for c in right)
    lines.append(f"Right songs at or above RECOGNITION_MATCH_RATIO={match_ratio}: {kept} of {len(right)}")
    if match_ratio == DEFAULTS["matchRatio"] and candidate_ratio == DEFAULTS["candidateRatio"]:
        lines.append("The defaults already keep every wrong song out: no change needed.")
    else:
        lines.append(f"Suggested: RECOGNITION_MATCH_RATIO={match_ratio}  RECOGNITION_CANDIDATE_RATIO={candidate_ratio}")
    return lines


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("songs")
    ap.add_argument("posts", nargs="?")
    ap.add_argument("--labels")
    ap.add_argument("--edits", action="store_true")
    ap.add_argument("--voice", help="a speech recording to lay over the generated edits")
    ap.add_argument("--json", help="write every case to this file")
    for key, value in DEFAULTS.items():
        ap.add_argument(f"--{key}", type=float, default=value, help=f"default {value}")
    args = ap.parse_args(argv)
    thresholds = {key: getattr(args, key) for key in DEFAULTS}
    if not args.posts and not args.edits:
        ap.error("give a posts folder, --edits, or both")

    song_files = media_files(args.songs)
    if len(song_files) < 2:
        raise SystemExit("Put at least two songs in the songs folder.")
    names = [stem(p) for p in song_files]
    if len(set(names)) != len(names):
        raise SystemExit("Two song files have the same name (without extension).")

    print(f"Fingerprinting {len(song_files)} songs …", file=sys.stderr)
    audio, prints = {}, {}
    for path in song_files:
        y = read_audio(path, SONG_SECONDS)
        audio[stem(path)], prints[stem(path)] = y, fp.fingerprint(y)
    index = fp.Index(list(prints.items()))

    cases: list[Case] = []
    if args.posts:
        posts = media_files(args.posts)
        labels = labels_from(posts, args.labels, set(names))
        for post in posts:
            cases.append(run(Case(os.path.basename(post), labels[post], "post"), index, read_audio(post, POST_SECONDS), thresholds))
    if args.edits:
        voice = read_audio(args.voice, POST_SECONDS) if args.voice else None
        for n, name in enumerate(names):
            without = fp.Index([(k, v) for k, v in prints.items() if k != name])
            for label, y in edits(audio[name], n, voice).items():
                cases.append(run(Case(f"{name}: {label}", name, "edit"), index, y, thresholds))
                cases.append(run(Case(f"{name}: {label}", None, "edit, song not in catalogue"), without, y, thresholds))

    width = max(len(c.post) for c in cases)
    for c in cases:
        melody = "-" if c.melody is None else f"{c.melody:.2f}"
        expect = c.expected or "(none)"
        print(f"{c.verdict:<27} {c.post:<{width}}  expected {expect:<20} got {c.outcome:<9} {c.found or '':<20} score {c.score:6.0f}  ratio {c.ratio:5.2f}  melody {melody:>4}  windows {c.window_share:.2f}  {c.seconds:.1f}s")

    counts: dict[str, int] = {}
    for c in cases:
        counts[c.verdict] = counts.get(c.verdict, 0) + 1
    print("\nSummary")
    for verdict in ("ok", "suggested (person confirms)", "missed", "wrong suggestion", "WRONG SONG", "false suggestion", "FALSE MATCH"):
        if verdict in counts:
            print(f"  {verdict:<28} {counts[verdict]}")
    found = [c for c in cases if c.expected is not None]
    if found:
        hit = sum(c.verdict == "ok" for c in found)
        print(f"  found on its own: {hit} of {len(found)} ({100 * hit / len(found):.0f} %), with suggestions: {sum(c.verdict in ('ok', 'suggested (person confirms)') for c in found)}")
    print("\nThresholds")
    print("  Keep RECOGNITION_AUTO_IDENTIFY off while there is any FALSE MATCH or WRONG SONG above.")
    for line in suggest(cases, thresholds):
        print("  " + line)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump({"thresholds": thresholds, "cases": [{**c.__dict__, "verdict": c.verdict} for c in cases]}, f, indent=2)
    dangerous = counts.get("FALSE MATCH", 0) + counts.get("WRONG SONG", 0)
    return 1 if dangerous else 0


if __name__ == "__main__":
    sys.exit(main())
