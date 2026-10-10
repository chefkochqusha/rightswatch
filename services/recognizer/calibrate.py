"""Calibration run for the match thresholds (services/recognizer, Node's
`decideRecognition`): a catalogue of procedurally composed songs, whole
"posts" (20-45 s) cut from them under TikTok-style edits, and posts that
use NO catalogue song (other songs with the same chord progressions, voice
only, noise). Prints the evidence the decision rule reads, per case, so the
thresholds can be set where no negative passes.

Synthetic songs are far more alike than real recordings, so this is a
conservative first setting; round 2 with real music re-runs it.

    python3 services/recognizer/calibrate.py [catalogue size] [negatives]
"""
import json
import os
import sys
import time

import numpy as np
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "..", "research", "fingerprint"))

import bekvor_fp as fp  # noqa: E402
from bench import ff, make_voice, mix_db, pink  # noqa: E402
from synth import SR, make_song  # noqa: E402

N_CAT = int(sys.argv[1]) if len(sys.argv) > 1 else 30
N_NEG = int(sys.argv[2]) if len(sys.argv) > 2 else 15


def to_fs(x):
    return resample_poly(x, fp.FS, SR).astype(np.float32)


def post_variants(clip, seed):
    rng = np.random.default_rng(seed)
    voice = make_voice(seed + 99, len(clip) / SR + 1)
    v = {
        "clean": clip,
        "aac 64k": ff(clip, None, "aac"),
        "noise 10dB": mix_db(clip, pink(len(clip), rng), 10),
        "voice over (music -6dB)": mix_db(clip, voice, -6),
        "voice over (music -12dB)": mix_db(clip, voice, -12),
        "phone + room": ff(clip, "highpass=f=300,lowpass=f=3500,aecho=0.8:0.6:40|70:0.3|0.2"),
        "sped up 1.25x": ff(clip, f"asetrate={int(SR*1.25)},aresample={SR}"),
        "slowed 0.85x": ff(clip, f"asetrate={int(SR*0.85)},aresample={SR}"),
        "tempo 1.2x pitch kept": ff(clip, "rubberband=tempo=1.2"),
        "pitch -3 st": ff(clip, "rubberband=pitch=0.84090"),
    }
    combo = ff(clip, f"asetrate={int(SR*1.2)},aresample={SR}")
    combo = mix_db(combo, voice, -9)
    v["worst: 1.2x + voice + phone + aac"] = ff(combo, "highpass=f=300,lowpass=f=3500", "aac")
    # music only in part of the post: talking first, song comes in halfway
    half = len(clip) // 2
    part = np.concatenate([make_voice(seed + 7, half / SR + 1)[:half], clip[half:]]).astype(np.float32)
    v["song only in 2nd half"] = part
    return v


def main():
    rng = np.random.default_rng(11)
    t0 = time.time()
    songs = {f"song-{i+1}": make_song(i + 1) for i in range(N_CAT)}
    index = fp.Index([(name, fp.fingerprint(to_fs(x))) for name, x in songs.items()])
    print(f"catalogue {N_CAT} songs indexed in {time.time()-t0:.1f}s", flush=True)

    rows = []
    for i, (name, x) in enumerate(songs.items()):
        length = rng.uniform(20, 45)
        start = rng.uniform(3, max(4, len(x) / SR - length * 1.3 - 3))
        raw = x[int(start * SR): int((start + length * 1.3) * SR)]
        for variant, y in post_variants(raw, i).items():
            y = y[: int(length * SR)]
            t = time.time()
            r = fp.match(index, to_fs(y))
            top = r["candidates"][0] if r["candidates"] else None
            rows.append({"kind": "positive", "variant": variant, "truth": name, "top": top, "windows": r["windows"], "ms": round((time.time() - t) * 1000)})
        print(f"  {name} done", flush=True)

    for j in range(N_NEG):
        x = make_song(5000 + j)
        length = rng.uniform(20, 45)
        start = rng.uniform(3, len(x) / SR - length - 3)
        clip = x[int(start * SR): int((start + length) * SR)]
        for variant, y in (
            ("other song", clip),
            ("other song + voice", mix_db(clip, make_voice(j + 3, length + 1), -9)),
            ("other song sped up", ff(clip, f"asetrate={int(SR*1.2)},aresample={SR}")[: int(length * SR)]),
            ("voice only", make_voice(800 + j, length)),
            ("noise only", pink(int(length * SR), rng)),
        ):
            r = fp.match(index, to_fs(y))
            top = r["candidates"][0] if r["candidates"] else None
            rows.append({"kind": "negative", "variant": variant, "truth": None, "top": top, "windows": r["windows"]})

    out = os.path.join(HERE, f"calibration-{N_CAT}.json")
    json.dump(rows, open(out, "w"), indent=1)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
