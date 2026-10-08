"""Procedurally composed test songs: drums, bass, chord pad, lead melody, varied
timbre/tempo/key. Many songs share the same chord progressions on purpose, so
near-identical harmony is a real false-positive test. Also a speech-like voice
generator for 'voiceover on top of the music'."""
import numpy as np

SR = 16000
PROGRESSIONS = [[0, 7, 9, 5], [9, 5, 0, 7], [0, 5, 7, 5], [0, 9, 5, 7], [2, 7, 0, 0], [0, 7, 9, 4]]
MAJOR = [0, 2, 4, 5, 7, 9, 11]


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tone(freq, dur, sr, harmonics, attack=0.01, decay=0.3, vibrato=0.0, rng=None):
    n = int(dur * sr)
    t = np.arange(n) / sr
    ph_mod = vibrato * np.sin(2 * np.pi * 5.5 * t) if vibrato else 0
    out = np.zeros(n)
    for k, a in enumerate(harmonics, start=1):
        if freq * k > sr / 2 - 200:
            break
        out += a * np.sin(2 * np.pi * freq * k * t + k * ph_mod)
    env = np.minimum(1, t / max(attack, 1e-3)) * np.exp(-t / max(decay, 1e-3))
    return out * env


def kick(sr):
    t = np.arange(int(0.25 * sr)) / sr
    f = 50 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-t * 12)


def snare(sr, rng):
    t = np.arange(int(0.2 * sr)) / sr
    return (rng.standard_normal(len(t)) * 0.6 + np.sin(2 * np.pi * 190 * t) * 0.4) * np.exp(-t * 20)


def hat(sr, rng):
    t = np.arange(int(0.05 * sr)) / sr
    x = rng.standard_normal(len(t))
    x = np.diff(np.concatenate([[0], x]))  # crude highpass
    return x * np.exp(-t * 80) * 0.3


def add(buf, sig, start):
    s = int(start)
    if s >= len(buf):
        return
    e = min(len(buf), s + len(sig))
    buf[s:e] += sig[: e - s]


def make_song(seed, seconds=90, sr=SR):
    rng = np.random.default_rng(seed)
    bpm = rng.uniform(78, 145)
    beat = 60 / bpm
    key = int(rng.integers(52, 64))
    prog = PROGRESSIONS[int(rng.integers(len(PROGRESSIONS)))]
    pad_h = rng.dirichlet(np.ones(8)) * 1.2
    lead_h = rng.dirichlet(np.ones(6) * 0.7)
    bass_h = [1, 0.5, 0.25, 0.12]
    swing = rng.uniform(0, 0.12)
    buf = np.zeros(int(seconds * sr))
    n_beats = int(seconds / beat)
    drum_pat = rng.integers(0, 2, size=8)
    melody_rng = np.random.default_rng(seed * 7 + 1)
    motif = [int(melody_rng.integers(0, 10)) for _ in range(8)]
    for b in range(n_beats):
        tb = b * beat * sr
        bar, pos = divmod(b, 4)
        chord_root = key + prog[(bar // 1) % len(prog)] - 12
        if pos in (0, 2) or drum_pat[pos * 2 % 8]:
            add(buf, kick(sr) * 0.9, tb)
        if pos in (1, 3):
            add(buf, snare(sr, rng) * 0.5, tb)
        for h in (0, 1):
            add(buf, hat(sr, rng), tb + (h * 0.5 + (swing if h else 0)) * beat * sr)
        # bass
        add(buf, tone(midi_hz(chord_root - 12 + (7 if pos == 2 else 0)), beat * 0.9, sr, bass_h, decay=0.4) * 0.45, tb)
        # pad on bar start
        if pos == 0:
            third = 4 if prog[bar % len(prog)] in (0, 5, 7) else 3
            for iv in (0, third, 7, 12):
                add(buf, tone(midi_hz(chord_root + 12 + iv), beat * 4, sr, pad_h, attack=0.15, decay=2.5) * 0.12, tb)
        # lead: motif with variation, 8th notes, rests
        for half in (0, 1):
            step = (b * 2 + half) % 8
            if melody_rng.random() < 0.65:
                deg = (motif[step] + (bar // 4) % 3) % 10
                note = key + 12 + MAJOR[deg % 7] + 12 * (deg // 7)
                add(buf, tone(midi_hz(note), beat * 0.45, sr, lead_h, decay=0.25, vibrato=0.002) * 0.22,
                    tb + half * beat * sr / 2)
    buf /= np.max(np.abs(buf)) + 1e-9
    return buf.astype(np.float32) * 0.9


def make_voice(seed, seconds, sr=SR):
    """Speech-like signal: glottal pulses with moving pitch, formant filtering, syllable envelope, pauses."""
    rng = np.random.default_rng(seed)
    n = int(seconds * sr)
    t = np.arange(n) / sr
    f0 = rng.uniform(100, 210) * (1 + 0.15 * np.sin(2 * np.pi * rng.uniform(0.2, 0.6) * t) + 0.05 * rng.standard_normal(n).cumsum() / np.sqrt(n))
    phase = np.cumsum(f0) / sr
    pulses = (np.diff(np.floor(phase), prepend=0) > 0).astype(float)
    src = np.convolve(pulses, np.exp(-np.arange(40) / 8), mode="same") + 0.05 * rng.standard_normal(n)
    out = np.zeros(n)
    from scipy.signal import lfilter
    seg = int(0.08 * sr)
    formants = [(730, 1090), (270, 2290), (300, 870), (530, 1840), (660, 1720), (490, 1350)]
    for s in range(0, n, seg):
        f1, f2 = formants[int(rng.integers(len(formants)))]
        chunk = src[s:s + seg]
        y = np.zeros_like(chunk)
        for f, bw in ((f1, 90), (f2, 120)):
            r = np.exp(-np.pi * bw / sr)
            a = [1, -2 * r * np.cos(2 * np.pi * f / sr), r * r]
            y += lfilter([1 - r], a, chunk)
        out[s:s + seg] = y
    syll = 0.5 * (1 + np.sin(2 * np.pi * rng.uniform(3.5, 5.5) * t)) ** 2
    pauses = (np.sin(2 * np.pi * 0.35 * t + rng.uniform(0, 6)) > -0.6).astype(float)
    out *= syll * np.convolve(pauses, np.ones(400) / 400, mode="same")
    out /= np.max(np.abs(out)) + 1e-9
    return out.astype(np.float32)
