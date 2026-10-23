"""Fingerprints of synth2 songs, cached on disk, for large-catalogue tests.

    python3 research/fingerprint/make_catalogue.py FIRST_SEED COUNT [WORKERS]

Each song is composed (synth2.make_song, 150 s), resampled to the recognizer's
rate and fingerprinted exactly as the service does (bekvor_fp.fingerprint).
Peaks, melody and duration go to $SYNTH2_CACHE/<seed>.npz (default
/tmp/bekvor-synth2-cache); seeds already there are skipped, so a run can be
stopped and resumed. About 3 s of one core per song.
"""
from __future__ import annotations

import os
import sys
import time
from multiprocessing import Pool

import numpy as np
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "..", "services", "recognizer"))

import bekvor_fp as fp  # noqa: E402
from synth2 import SR, make_song  # noqa: E402

CACHE = os.environ.get("SYNTH2_CACHE", "/tmp/bekvor-synth2-cache")
SONG_SEC = 150


def path_for(seed: int) -> str:
    return os.path.join(CACHE, f"{seed}.npz")


def song_audio(seed: int, direct: bool = True) -> np.ndarray:
    """The song at the recognizer's sample rate: rendered at 8 kHz directly
    (distractors, twice as fast), or at 16 kHz and resampled the way posts are."""
    if direct:
        return make_song(seed, SONG_SEC, sr=fp.FS)
    return resample_poly(make_song(seed, SONG_SEC), fp.FS, SR).astype(np.float32)


def build(seed: int) -> int:
    path = path_for(seed)
    if os.path.exists(path):
        return 0
    f = fp.fingerprint(song_audio(seed))
    tmp = path + ".tmp.npz"
    np.savez(tmp, peaks=f.peaks.astype(np.uint16), melody=f.melody, duration=np.float64(f.duration_sec))
    os.replace(tmp, path)
    return 1


def load(seed: int) -> fp.Fingerprint:
    z = np.load(path_for(seed))
    return fp.Fingerprint.from_peaks(z["peaks"].astype(np.float32), float(z["duration"]), z["melody"])


def main():
    first, count = int(sys.argv[1]), int(sys.argv[2])
    workers = int(sys.argv[3]) if len(sys.argv) > 3 else (os.cpu_count() or 1)
    os.makedirs(CACHE, exist_ok=True)
    seeds = [s for s in range(first, first + count) if not os.path.exists(path_for(s))]
    t0, done = time.time(), 0
    with Pool(workers) as pool:
        for made in pool.imap_unordered(build, seeds, chunksize=4):
            done += made
            if done % 200 == 0 and done:
                rate = done / (time.time() - t0)
                print(f"# {done}/{len(seeds)} songs, {rate:.2f}/s, {(len(seeds) - done) / rate / 60:.0f} min left", flush=True)
    print(f"# done: {done} new songs in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
