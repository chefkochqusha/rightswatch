"""Real recordings instead of composed songs: does recognition hold for real
music, real speech over it, and TikTok-style edits?

Uses the openly licensed recordings in librosa's example data
(github.com/librosa/data): four songs (Brahms' Hungarian Dance No. 5 by the
US Army Strings, public domain; "Let's Go Fishin'" by Karissa Hobbs, CC BY 3.0;
"Dance of the Sugar Plum Fairy" and "Vibe Ace" by Kevin MacLeod, CC BY 3.0)
and three LibriVox readings (CC BY 4.0) as the voice-over. Non-commercial
(NC) files are not used.

    git clone --depth 1 https://github.com/librosa/data /tmp/realmusic/data
    REAL_AUDIO=/tmp/realmusic/data/audio python3 research/fingerprint/real_music.py [distractors]

The catalogue is the four songs plus `distractors` composed songs (0 = 30
composed songs only; 2000 = the shortlist path). Prints one JSON line.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "services", "recognizer"))
sys.path.insert(0, HERE)
_argv, sys.argv = sys.argv, ["x"]
import bekvor_fp as fp  # noqa: E402
import scale_bench as sb  # noqa: E402
from bench import ff, mix_db  # noqa: E402
from synth import SR, make_song  # noqa: E402

sys.argv = _argv
AUDIO = os.environ.get("REAL_AUDIO", "/tmp/realmusic/data/audio")
SONGS = {
    "hungarian-dance": "Hungarian_Dance_number_5_-_Allegro_in_F_sharp_minor_(string_orchestra).hq.ogg",
    "lets-go-fishin": "Karissa_Hobbs_-_Let's_Go_Fishin'.hq.ogg",
    "sugar-plum": "Kevin_MacLeod_-_P_I_Tchaikovsky_Dance_of_the_Sugar_Plum_Fairy.hq.ogg",
    "vibe-ace": "Kevin_MacLeod_-_Vibe_Ace.hq.ogg",
}
SPEECH = ["198-209-0000.hq.ogg", "3436-172162-0000.hq.ogg", "5703-47212-0000.hq.ogg"]
OTHER = ["glacier-bay-humpback.hq.ogg"]


def load(name: str, sr: int = SR) -> np.ndarray:
    out = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", os.path.join(AUDIO, name), "-ac", "1", "-ar", str(sr), "-f", "f32le", "pipe:1"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(out, np.float32).copy()


def speech_bed(seconds: float, start: int) -> np.ndarray:
    parts = [load(n) for n in SPEECH[start:] + SPEECH[:start]]
    bed = np.concatenate(parts)
    while len(bed) < seconds * SR:
        bed = np.concatenate([bed, bed])
    return bed[: int(seconds * SR)]


def main():
    distractors = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    songs = {k: load(v) for k, v in SONGS.items()}
    tracks = [(k, fp.fingerprint(sb.to_fs(v))) for k, v in songs.items()]
    if distractors == 0:
        tracks += [(f"song-{s}", fp.fingerprint(sb.song_audio(s))) for s in range(1, 31)]
    else:
        rng = np.random.default_rng(5)
        bases = list(range(10_001, 10_061))
        per = -(-distractors // len(bases))
        for b in bases:
            _, pk, mel, d = sb.analyse(b)
            for v in range(per):
                if len(tracks) >= distractors + len(songs):
                    break
                tracks.append((f"d-{b}-{v}", sb.variant_fingerprint(pk, mel, d, float(rng.uniform(0.8, 1.25)), int(rng.integers(-9, 10)))))
    index = fp.Index(tracks)
    del tracks

    edits = {
        "clean": lambda c, i: c,
        "aac 64k": lambda c, i: ff(c, None, "aac"),
        "voice -6dB": lambda c, i: mix_db(c, speech_bed(len(c) / SR + 1, i % 3), -6),
        "voice -12dB": lambda c, i: mix_db(c, speech_bed(len(c) / SR + 1, i % 3), -12),
        "sped 1.25x": lambda c, i: ff(c, f"asetrate={int(SR*1.25)},aresample={SR}"),
        "slowed 0.85x": lambda c, i: ff(c, f"asetrate={int(SR*0.85)},aresample={SR}"),
        "tempo 1.2x pitch kept": lambda c, i: ff(c, "rubberband=tempo=1.2"),
        "pitch -3 st": lambda c, i: ff(c, "rubberband=pitch=0.84090"),
        "phone + room": lambda c, i: ff(c, "highpass=f=300,lowpass=f=3500,aecho=0.8:0.6:40|70:0.3|0.2"),
        "worst": lambda c, i: ff(mix_db(ff(c, f"asetrate={int(SR*1.2)},aresample={SR}"), speech_bed(len(c) / SR + 1, i % 3), -9), "highpass=f=300,lowpass=f=3500", "aac"),
    }
    rng = np.random.default_rng(11)
    rows, times = [], []
    for name, x in songs.items():
        dur = len(x) / SR
        for j in range(4):
            length = min(20.0, dur * 0.4)
            start = rng.uniform(0, max(0.1, dur - length * 1.3))
            clip = x[int(start * SR): int((start + length * 1.3) * SR)]
            for edit, fn in edits.items():
                y = fn(clip, j)[: int(length * SR)]
                t = time.time()
                r = fp.match(index, sb.to_fs(y))
                times.append(time.time() - t)
                outcome, track = sb.decide(r)
                top = r["candidates"][0] if r["candidates"] else {}
                rows.append(dict(kind="pos", edit=edit, outcome=outcome, right=track == name, top_right=top.get("trackId") == name,
                                 ratio=round(top.get("score", 0) / max(top.get("nextScore", 0), 20), 2), melody=top.get("melodyAgreement")))
    negatives = [("speech only", speech_bed(20, 0)), ("whale", load(OTHER[0])[: 20 * SR])]
    for s in range(20_001, 20_009):
        negatives.append(("other composed song", make_song(s, 25)[5 * SR: 25 * SR]))
    for label, y in negatives:
        r = fp.match(index, sb.to_fs(y))
        rows.append(dict(kind="neg", edit=label, outcome=sb.decide(r)[0]))

    summary = {}
    for row in rows:
        if row["kind"] != "pos":
            continue
        e = summary.setdefault(row["edit"], dict(n=0, top_right=0, match=0, match_wrong=0, candidate=0, nothing=0, ratios=[], melody=[]))
        e["n"] += 1
        e["top_right"] += row["top_right"]
        e["ratios"].append(row["ratio"])
        if row["melody"] is not None:
            e["melody"].append(row["melody"])
        if row["outcome"] == "MATCH":
            e["match" if row["right"] else "match_wrong"] += 1
        elif row["outcome"] == "CANDIDATE":
            e["candidate"] += 1
        else:
            e["nothing"] += 1
    for e in summary.values():
        e["ratio_median"] = float(np.median(e.pop("ratios")))
        mel = e.pop("melody")
        e["melody_median"] = float(np.median(mel)) if mel else None
    neg = [r for r in rows if r["kind"] == "neg"]
    print(json.dumps(dict(
        catalogue=len(index.ids), shortlist=index.large,
        match_ms_median=round(1000 * float(np.median(times))),
        positives=summary,
        negatives=dict(n=len(neg), match=sum(r["outcome"] == "MATCH" for r in neg), candidate=sum(r["outcome"] == "CANDIDATE" for r in neg)),
    ), indent=1))


if __name__ == "__main__":
    main()
