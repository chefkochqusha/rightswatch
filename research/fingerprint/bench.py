"""Benchmark: catalogue of N songs, 10 s TikTok-style clips under realistic edits,
plus clips from songs NOT in the catalogue (same chord progressions) for false positives."""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

from fp import Index
from synth import SR, make_song, make_voice

N_CAT = int(sys.argv[1]) if len(sys.argv) > 1 else 40
N_NEG = int(sys.argv[2]) if len(sys.argv) > 2 else 20
CLIP = float(sys.argv[3]) if len(sys.argv) > 3 else 10.0
TMP = tempfile.mkdtemp(prefix="fpbench-")


def ff(x, filt, codec=None):
    """Run an ffmpeg audio filter (and optionally a lossy codec round-trip)."""
    src = os.path.join(TMP, "in.wav")
    sf.write(src, x, SR)
    mid = os.path.join(TMP, "mid." + ("mp3" if codec == "mp3" else "m4a" if codec == "aac" else "wav"))
    args = ["ffmpeg", "-y", "-loglevel", "error", "-i", src]
    if filt:
        args += ["-af", filt]
    if codec == "mp3":
        args += ["-c:a", "libmp3lame", "-b:a", "64k"]
    elif codec == "aac":
        args += ["-c:a", "aac", "-b:a", "64k"]
    args += ["-ar", str(SR), "-ac", "1", mid]
    subprocess.run(args, check=True)
    out = os.path.join(TMP, "out.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mid, "-ar", str(SR), "-ac", "1", out], check=True)
    y, _ = sf.read(out, dtype="float32")
    return y


def mix_db(music, other, music_db):
    """music level relative to the other signal (e.g. -12 dB under a voice)."""
    o = other[: len(music)]
    rm, ro = np.sqrt(np.mean(music ** 2)) + 1e-9, np.sqrt(np.mean(o ** 2)) + 1e-9
    y = music * (ro / rm) * 10 ** (music_db / 20) + o
    return (y / (np.max(np.abs(y)) + 1e-9) * 0.9).astype(np.float32)


def pink(n, rng):
    w = rng.standard_normal(n)
    f = np.fft.rfft(w)
    f /= np.sqrt(np.arange(1, len(f) + 1))
    return np.fft.irfft(f, n).astype(np.float32)


def variants(clip, seed):
    rng = np.random.default_rng(seed)
    voice = make_voice(seed + 99, len(clip) / SR + 1)
    long = None
    v = {
        "clean": clip,
        "aac 64k": ff(clip, None, "aac"),
        "noise 10dB": mix_db(clip, pink(len(clip), rng), 10),
        "noise 0dB": mix_db(clip, pink(len(clip), rng), 0),
        "voice over (music -6dB)": mix_db(clip, voice, -6),
        "voice over (music -12dB)": mix_db(clip, voice, -12),
        "phone speaker + room": ff(clip, "highpass=f=300,lowpass=f=3500,aecho=0.8:0.6:40|70:0.3|0.2"),
        "sped up 1.25x (pitch up)": ff(clip, f"asetrate={int(SR*1.25)},aresample={SR}"),
        "sped up 1.15x (pitch up)": ff(clip, f"asetrate={int(SR*1.15)},aresample={SR}"),
        "slowed 0.85x (pitch down)": ff(clip, f"asetrate={int(SR*0.85)},aresample={SR}"),
        "tempo 1.2x, pitch kept": ff(clip, "rubberband=tempo=1.2"),
        "tempo 0.85x, pitch kept": ff(clip, "rubberband=tempo=0.85"),
        "pitch +2 semitones": ff(clip, "rubberband=pitch=1.12246"),
        "pitch -3 semitones": ff(clip, "rubberband=pitch=0.84090"),
    }
    combo = ff(clip, f"asetrate={int(SR*1.2)},aresample={SR}")
    combo = mix_db(combo, voice, -9)
    v["worst case: sped up 1.2x + voice + phone + aac"] = ff(combo, "highpass=f=300,lowpass=f=3500", "aac")
    return v


def main():
    idx = Index()
    rng = np.random.default_rng(7)
    songs = {}
    for i in range(N_CAT):
        x = make_song(i + 1)
        songs[i] = x
        idx.add(f"song-{i+1}", x, SR)
    idx.finalize()
    print(f"catalogue: {N_CAT} songs, {sum(idx.sizes)} hashes", flush=True)

    results = {}
    scores_pos = []
    for i, x in songs.items():
        start = rng.uniform(5, len(x) / SR - CLIP - 15)
        # take a little extra so sped-up variants still last CLIP seconds
        raw = x[int(start * SR): int((start + CLIP * 1.3) * SR)]
        for name, y in variants(raw, i).items():
            # every query is exactly CLIP seconds of the edited audio
            y = y[: int(CLIP * SR)]
            r = idx.query(y, SR)
            ok = r["name"] == f"song-{i+1}"
            results.setdefault(name, []).append((ok, r["score"], r["second"], r["ms"]))
            scores_pos.append((name, ok, r["score"], r["second"]))
        print(f"  song {i+1}/{N_CAT} done", flush=True)

    neg = []
    for j in range(N_NEG):
        x = make_song(5000 + j)
        start = rng.uniform(5, len(x) / SR - CLIP - 5)
        clip = x[int(start * SR): int((start + CLIP) * SR)]
        for name, y in (("clean", clip), ("voice", mix_db(clip, make_voice(j + 3, CLIP + 1), -9)),
                        ("sped", ff(clip, f"asetrate={int(SR*1.2)},aresample={SR}")[: int(CLIP * SR)])):
            r = idx.query(y, SR)
            neg.append((name, r["score"], r["second"]))
        # pure voice, no music at all
        r = idx.query(make_voice(800 + j, CLIP), SR)
        neg.append(("voice only", r["score"], r["second"]))

    json.dump({"results": results, "neg": neg}, open(f"bench-{N_CAT}-{CLIP:.0f}s.json", "w"))
    neg_scores = sorted(s for _, s, _ in neg)
    print("negatives: max score", neg_scores[-1], "p95", neg_scores[int(len(neg_scores) * 0.95) - 1])
    thr = neg_scores[-1] + 1
    print(f"threshold (max negative + 1) = {thr}")
    print(f"{'variant':52s} top1   detected@thr  median score  median ms")
    for name, rows in results.items():
        top1 = np.mean([ok for ok, *_ in rows])
        det = np.mean([ok and s >= thr for ok, s, *_ in rows])
        print(f"{name:52s} {top1*100:5.1f}%  {det*100:5.1f}%       {np.median([s for _, s, *_ in rows]):7.0f}     {np.median([m for *_, m in rows]):6.0f}")


if __name__ == "__main__":
    main()
