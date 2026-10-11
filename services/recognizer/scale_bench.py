"""Scale test: does recognition hold with a large catalogue (the Agency plan
allows 20,000 songs)? Measures index memory, build time, time per post, and
accuracy and false matches, as the catalogue grows.

A catalogue of N songs is:
- K "real" catalogue songs, procedurally composed (synth.py), whose posts
  are queried under TikTok-style edits;
- N - K distractors: other composed songs, multiplied cheaply by building
  fingerprints of transposed and re-timed versions of them. They look like
  more songs to the index (rarity weights, posting lists, memory) without
  composing 20,000 songs.

Negatives are posts of songs that are in no form in the catalogue.

    python3 services/recognizer/scale_bench.py 2000 [K=40] [bases=60]

Prints one JSON line of results; writes nothing else.
"""
from __future__ import annotations

import json
import os
import resource
import sys
import time
from multiprocessing import Pool

import numpy as np
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "..", "research", "fingerprint"))

import bekvor_fp as fp  # noqa: E402
from bench import ff, make_voice, mix_db, pink  # noqa: E402
from synth import SR, make_song  # noqa: E402

N = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
K = int(sys.argv[2]) if len(sys.argv) > 2 else 40
BASES = int(sys.argv[3]) if len(sys.argv) > 3 else 60
SONG_SEC = 150
CACHE = os.environ.get("SCALE_CACHE", "/tmp/bekvor-scale-cache")


def to_fs(x):
    return resample_poly(x, fp.FS, SR).astype(np.float32)


def song_audio(seed: int) -> np.ndarray:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"song-{seed}-{SONG_SEC}.npy")
    if os.path.exists(path):
        return np.load(path)
    y = to_fs(make_song(seed, SONG_SEC))
    np.save(path, y)
    return y


def analyse(seed: int):
    y = song_audio(seed)
    bands = fp._tonal_bands(y)
    return seed, fp.peaks(y, bands=bands), fp.melody(bands), len(y) / fp.FS


def variant_fingerprint(pk, mel, duration, speed, shift):
    """The fingerprint of the song played at `speed` and transposed by `shift` log bins."""
    p = pk.copy()
    p[:, 0] /= speed
    p[:, 1] += shift
    p = p[(p[:, 1] >= 0) & (p[:, 1] < fp.NLOG)]
    p = np.round(p[np.argsort(p[:, 0], kind="stable")])
    idx = np.round(np.arange(int(len(mel) / speed)) * speed).astype(np.int64)
    m = mel[np.minimum(idx, len(mel) - 1)].astype(np.int64)
    m = np.where(m == fp.UNVOICED, fp.UNVOICED, np.clip(m + shift, 0, 254)).astype(np.uint8)
    return fp.Fingerprint.from_peaks(p.astype(np.float32), duration / speed, m)


def decide(r, t=dict(match_ratio=3, candidate_ratio=1.6, min_score=60, min_window_share=0.5, ratio_floor=20, min_melody=0.7)):
    """The app's decideRecognition (src/modules/recognition/decide.ts)."""
    c = r["candidates"][0] if r["candidates"] else None
    if not c or c["score"] < t["min_score"]:
        return "NO_MATCH", None
    ratio = c["score"] / max(c["nextScore"], t["ratio_floor"])
    share = c["windowsWon"] / r["windows"] if r["windows"] else 0
    strong = ratio >= t["match_ratio"] and share >= t["min_window_share"]
    mel = c.get("melodyAgreement")
    if strong and mel is not None and mel >= t["min_melody"]:
        return "MATCH", c["trackId"]
    if strong or ratio >= t["candidate_ratio"]:
        return "CANDIDATE", c["trackId"]
    return "NO_MATCH", None


def index_bytes(index) -> int:
    return index.nbytes()


def main():
    t0 = time.time()
    cat_seeds = list(range(1, K + 1))
    base_seeds = list(range(10_001, 10_001 + BASES))
    neg_seeds = list(range(20_001, 20_013))
    with Pool(os.cpu_count()) as pool:
        analysed = {s: (pk, mel, d) for s, pk, mel, d in pool.map(analyse, cat_seeds + base_seeds + neg_seeds)}
    t_audio = time.time() - t0
    print(f'# audio ready in {t_audio:.0f}s', file=sys.stderr, flush=True)

    tracks = []
    for s in cat_seeds:
        tracks.append((f"song-{s}", fp.fingerprint(song_audio(s))))
    # distractors: transposed and re-timed versions of the base songs
    rng = np.random.default_rng(5)
    per_base = max(1, -(-(N - K) // BASES))
    for b in base_seeds:
        pk, mel, d = analysed[b]
        for v in range(per_base):
            if len(tracks) >= N:
                break
            speed = float(rng.uniform(0.8, 1.25))
            shift = int(rng.integers(-9, 10))
            tracks.append((f"d-{b}-{v}", variant_fingerprint(pk, mel, d, speed, shift)))
    # pair hashes made and dropped (fingerprints would otherwise keep them: ~300 KB a song)
    postings = sum(len(fp.pair_hashes(f.peaks)[0]) if f.peaks is not None else len(f.hashes) for _, f in tracks)
    db_bytes = sum(len(f.to_bytes()) for _, f in tracks)

    t1 = time.time()
    rss0 = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    index = fp.Index(tracks)
    t_index = time.time() - t1
    rss1 = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    del tracks
    print(f'# index built in {t_index:.1f}s, {index_bytes(index)/1e6:.0f} MB', file=sys.stderr, flush=True)

    rows = []
    qrng = np.random.default_rng(11)
    edits = {
        "clean": lambda c, i: c,
        "aac 64k": lambda c, i: ff(c, None, "aac"),
        "voice -6dB": lambda c, i: mix_db(c, make_voice(i + 99, len(c) / SR + 1), -6),
        "voice -12dB": lambda c, i: mix_db(c, make_voice(i + 99, len(c) / SR + 1), -12),
        "sped 1.25x": lambda c, i: ff(c, f"asetrate={int(SR*1.25)},aresample={SR}"),
        "slowed 0.85x": lambda c, i: ff(c, f"asetrate={int(SR*0.85)},aresample={SR}"),
        "phone + room": lambda c, i: ff(c, "highpass=f=300,lowpass=f=3500,aecho=0.8:0.6:40|70:0.3|0.2"),
        "worst": lambda c, i: ff(mix_db(ff(c, f"asetrate={int(SR*1.2)},aresample={SR}"), make_voice(i + 99, len(c) / SR + 1), -9), "highpass=f=300,lowpass=f=3500", "aac"),
    }
    times = []
    for i, s in enumerate(cat_seeds):
        x = make_song(s, SONG_SEC)
        length = qrng.uniform(20, 40)
        start = qrng.uniform(3, SONG_SEC - length * 1.3 - 3)
        clip = x[int(start * SR): int((start + length * 1.3) * SR)]
        for name, edit in edits.items():
            y = edit(clip, i)[: int(length * SR)]
            t = time.time()
            r = fp.match(index, to_fs(y))
            times.append(time.time() - t)
            outcome, track = decide(r)
            top = r["candidates"][0]["trackId"] if r["candidates"] else None
            rows.append(dict(kind="pos", edit=name, outcome=outcome, right=track == f"song-{s}", top_right=top == f"song-{s}"))
        print(f'# song {i+1}/{K} queried, last match {times[-1]*1000:.0f} ms', file=sys.stderr, flush=True)
    for j, s in enumerate(neg_seeds):
        x = make_song(s, SONG_SEC)
        length = qrng.uniform(20, 40)
        clip = x[int(10 * SR): int((10 + length) * SR)]
        for name, y in (("other song", clip), ("other + voice", mix_db(clip, make_voice(j + 3, length + 1), -9)), ("voice only", make_voice(800 + j, length)), ("noise", pink(int(length * SR), qrng))):
            t = time.time()
            r = fp.match(index, to_fs(y))
            times.append(time.time() - t)
            outcome, _ = decide(r)
            rows.append(dict(kind="neg", edit=name, outcome=outcome))

    by_edit = {}
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
    print(json.dumps(dict(
        catalogue=N, real=K, postings=postings, db_mb=round(db_bytes / 1e6, 1),
        index_mb=round(index_bytes(index) / 1e6, 1), rss_build_mb=round((rss1 - rss0) / 1024, 1), rss_peak_mb=round(rss1 / 1024, 1),
        build_s=round(t_index, 1), audio_s=round(t_audio, 1),
        match_ms_median=round(1000 * float(np.median(times))), match_ms_p95=round(1000 * float(np.percentile(times, 95))),
        positives=by_edit,
        negatives=dict(n=len(neg), match=sum(r["outcome"] == "MATCH" for r in neg), candidate=sum(r["outcome"] == "CANDIDATE" for r in neg)),
    ), indent=1))


if __name__ == "__main__":
    main()
