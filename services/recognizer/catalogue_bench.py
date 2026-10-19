"""Large-catalogue test with distinct songs (research/fingerprint/synth2.py).

scale_bench.py fills the catalogue with transposed and re-timed copies of 60
base songs: about 330 copies of each. To a search that ignores speed and pitch
(the shortlist) those copies are one song 330 times, so a sped-up post is
crowded out by copies of other songs, which no real catalogue does. Here every
catalogue song is a different composition, with its own key, mode, form,
progressions, tempo, instruments and melodies.

    python3 services/recognizer/catalogue_bench.py N [K=20] [--detail]

N catalogue songs: K queried ones (seeds 1..K, rendered at 16 kHz and
resampled like real posts) and N-K distractors read from the fingerprint
cache (research/fingerprint/make_catalogue.py 100000 N-K fills it). Each
queried song gives a 20-40 s post under each edit; 12 songs outside the
catalogue give the negatives. Posts are cached in $QUERY_CACHE so runs that
compare matchers use the same audio. Prints JSON; --detail adds one row per post
(shortlist rank of the right song, outcome, scores) for diagnosis.
"""
from __future__ import annotations

import json
import os
import resource
import sys
import time

import numpy as np
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.join(HERE, "..", "..", "research", "fingerprint")
sys.path.insert(0, HERE)
sys.path.insert(0, RESEARCH)

import bekvor_fp as fp  # noqa: E402
from bench import ff, mix_db, pink  # noqa: E402
from make_catalogue import load as load_cached  # noqa: E402
from scale_bench import decide  # noqa: E402
from synth import make_voice  # noqa: E402
from synth2 import SR, make_song  # noqa: E402

SONG_SEC = 150
DISTRACTOR_FIRST = 100_000
NEGATIVE_FIRST = 900_000
QUERY_CACHE = os.environ.get("QUERY_CACHE", "/tmp/bekvor-query-cache")

EDITS = {
    "clean": lambda c, i: c,
    "aac 64k": lambda c, i: ff(c, None, "aac"),
    "voice -6dB": lambda c, i: mix_db(c, make_voice(i + 99, len(c) / SR + 1), -6),
    "voice -12dB": lambda c, i: mix_db(c, make_voice(i + 99, len(c) / SR + 1), -12),
    "sped 1.25x": lambda c, i: ff(c, f"asetrate={int(SR*1.25)},aresample={SR}"),
    "slowed 0.85x": lambda c, i: ff(c, f"asetrate={int(SR*0.85)},aresample={SR}"),
    "tempo 1.2x": lambda c, i: ff(c, "rubberband=tempo=1.2"),
    "pitch -3st": lambda c, i: ff(c, "rubberband=pitch=0.84090"),
    "phone + room": lambda c, i: ff(c, "highpass=f=300,lowpass=f=3500,aecho=0.8:0.6:40|70:0.3|0.2"),
    "worst": lambda c, i: ff(mix_db(ff(c, f"asetrate={int(SR*1.2)},aresample={SR}"), make_voice(i + 99, len(c) / SR + 1), -9), "highpass=f=300,lowpass=f=3500", "aac"),
}


def to_fs(x: np.ndarray) -> np.ndarray:
    return resample_poly(x, fp.FS, SR).astype(np.float32)


def catalogue_song(seed: int) -> np.ndarray:
    return make_song(seed, SONG_SEC)


def tracks(n: int, k: int) -> list[tuple[str, fp.Fingerprint]]:
    out = [(f"song-{s}", fp.fingerprint(to_fs(catalogue_song(s)))) for s in range(1, k + 1)]
    missing = [s for s in range(DISTRACTOR_FIRST, DISTRACTOR_FIRST + n - k) if not os.path.exists(os.path.join(os.environ.get("SYNTH2_CACHE", "/tmp/bekvor-synth2-cache"), f"{s}.npz"))]
    if missing:
        raise SystemExit(f"{len(missing)} distractors not cached yet: python3 research/fingerprint/make_catalogue.py {DISTRACTOR_FIRST} {n - k}")
    out += [(f"d-{s}", load_cached(s)) for s in range(DISTRACTOR_FIRST, DISTRACTOR_FIRST + n - k)]
    return out


def queries(k: int) -> list[dict]:
    """Posts: (kind, song id or None, edit, audio at the recognizer's rate), cached."""
    os.makedirs(QUERY_CACHE, exist_ok=True)
    rng = np.random.default_rng(11)
    out = []
    for i, s in enumerate(range(1, k + 1)):
        length = rng.uniform(20, 40)
        start = rng.uniform(3, SONG_SEC - length * 1.3 - 3)
        clip = None
        for name, edit in EDITS.items():
            path = os.path.join(QUERY_CACHE, f"pos-{s}-{name.replace(' ', '_')}.npy")
            if not os.path.exists(path):
                if clip is None:
                    x = catalogue_song(s)
                    clip = x[int(start * SR): int((start + length * 1.3) * SR)]
                np.save(path, to_fs(edit(clip, i)[: int(length * SR)]))
            out.append(dict(kind="pos", song=f"song-{s}", edit=name, path=path))
    for j, s in enumerate(range(NEGATIVE_FIRST, NEGATIVE_FIRST + 12)):
        length = rng.uniform(20, 40)
        made = None
        for name in ("other song", "other + voice", "voice only", "noise"):
            path = os.path.join(QUERY_CACHE, f"neg-{s}-{name.replace(' ', '_')}.npy")
            if not os.path.exists(path):
                if made is None:
                    clip = catalogue_song(s)[int(10 * SR): int((10 + length) * SR)]
                    made = {
                        "other song": clip,
                        "other + voice": mix_db(clip, make_voice(j + 3, length + 1), -9),
                        "voice only": make_voice(800 + j, length),
                        "noise": pink(int(length * SR), np.random.default_rng(s)),
                    }
                np.save(path, to_fs(made[name]))
            out.append(dict(kind="neg", song=None, edit=name, path=path))
    return out


def shortlist_rank(index: fp.Index, y: np.ndarray, song: str) -> int | None:
    """Where the right song stands in the shortlist (0 = first), None if not in the wide one."""
    if not index.large:
        return None
    pk = fp.peaks(y)
    ranked = index.candidates(pk, fp.SHORTLIST_WIDE)
    ids = [index.ids[i] for i in ranked]
    return ids.index(song) if song in ids else None


def run(index: fp.Index, qs: list[dict], detail: bool = False, matcher=fp.match) -> dict:
    rows, times = [], []
    for q in qs:
        y = np.load(q["path"])
        t = time.time()
        r = matcher(index, y)
        times.append(time.time() - t)
        outcome, track = decide(r)
        top = r["candidates"][0] if r["candidates"] else None
        row = dict(kind=q["kind"], edit=q["edit"], song=q["song"], outcome=outcome,
                   right=q["song"] is not None and track == q["song"],
                   top_right=top is not None and top["trackId"] == q["song"],
                   top=top and top["trackId"], score=top and top["score"], next=top and top["nextScore"],
                   dense=bool(r.get("densePass")))
        if detail and q["kind"] == "pos":
            row["shortlist_rank"] = shortlist_rank(index, y, q["song"])
            right = [c for c in r["candidates"] if c["trackId"] == q["song"]]
            row["right_score"] = right[0]["score"] if right else None
        rows.append(row)
    by_edit: dict = {}
    for row in rows:
        if row["kind"] != "pos":
            continue
        e = by_edit.setdefault(row["edit"], dict(n=0, top_right=0, match=0, match_wrong=0, candidate=0, nothing=0))
        e["n"] += 1
        e["top_right"] += row["top_right"]
        if row["outcome"] == "MATCH":
            e["match"] += row["right"]
            e["match_wrong"] += not row["right"]
        elif row["outcome"] == "CANDIDATE":
            e["candidate"] += 1
        else:
            e["nothing"] += 1
    neg = [r for r in rows if r["kind"] == "neg"]
    out = dict(
        match_ms_median=round(1000 * float(np.median(times))), match_ms_p95=round(1000 * float(np.percentile(times, 95))),
        positives=by_edit,
        negatives=dict(n=len(neg), match=sum(r["outcome"] == "MATCH" for r in neg), candidate=sum(r["outcome"] == "CANDIDATE" for r in neg)),
    )
    if detail:
        out["rows"] = rows
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    n = int(args[0]) if args else 2000
    k = int(args[1]) if len(args) > 1 else 20
    t0 = time.time()
    qs = queries(k)
    t_q = time.time() - t0
    t0 = time.time()
    tr = tracks(n, k)
    t_tracks = time.time() - t0
    t0 = time.time()
    index = fp.Index(tr)
    t_index = time.time() - t0
    del tr
    print(f"# posts {t_q:.0f}s, fingerprints {t_tracks:.0f}s, index {t_index:.0f}s ({index.nbytes() / 1e6:.0f} MB)", file=sys.stderr, flush=True)
    res = run(index, qs, detail="--detail" in sys.argv)
    res = dict(catalogue=n, real=k, build_s=round(t_index, 1), index_mb=round(index.nbytes() / 1e6, 1),
               rss_peak_mb=round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1), **res)
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
