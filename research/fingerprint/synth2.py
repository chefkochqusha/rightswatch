"""Procedurally composed test songs, version 2: far more variety than synth.py.

synth.py draws every song from six chord progressions in a major key, which is
a deliberately hard false-positive test but nothing like a real catalogue,
where 20,000 songs are 20,000 different pieces. Here every song gets its own:

- key (all 12), mode (major, minor, dorian, mixolydian, harmonic minor),
- song form (intro, verse, chorus, bridge, outro) with a progression per section,
  drawn from the mode's chords, 2 to 8 chords long, with varied harmonic rhythm,
- tempo 68-172 bpm, 4/4 or 3/4, straight or swung,
- instruments: 2-5 voices out of pad, pluck/arpeggio, organ, bass styles, lead
  (synth or a vibrato "vocal" line), each with its own timbre and register,
- drums from a random 16-step grid per section (or none), kits of different pitch,
- melodies per section from a random walk over the scale with their own rhythm,
  repeated with variation, like a real hook,
- a little room (exponential-noise reverb) on some songs.

Deterministic per seed. 16 kHz mono float32, peak 0.9.
"""
from __future__ import annotations

import numpy as np

SR = 16000

MODES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
    "harmonic minor": [0, 2, 3, 5, 7, 8, 11],
}


def midi_hz(m):
    return 440.0 * 2 ** ((np.asarray(m, dtype=float) - 69) / 12)


def _tone(freq, dur, harmonics, attack, decay, sustain, vibrato=0.0, vib_rate=5.5, detune=0.0):
    n = max(1, int(dur * SR))
    t = np.arange(n) / SR
    ph_mod = vibrato * np.sin(2 * np.pi * vib_rate * t) if vibrato else 0.0
    out = np.zeros(n)
    for k, a in enumerate(harmonics, start=1):
        f = freq * k
        if f > SR / 2 - 300:
            break
        out += a * np.sin(2 * np.pi * f * t + k * ph_mod)
        if detune:
            out += 0.5 * a * np.sin(2 * np.pi * f * (1 + detune) * t + k * ph_mod)
    env = np.minimum(1.0, t / max(attack, 1e-3))
    env = env * (sustain + (1 - sustain) * np.exp(-t / max(decay, 1e-3)))
    rel = min(n, int(0.03 * SR))
    if rel > 1:
        env[-rel:] *= np.linspace(1, 0, rel)
    return out * env


def _add(buf, sig, start):
    s = int(start)
    if s >= len(buf) or s < 0:
        return
    e = min(len(buf), s + len(sig))
    buf[s:e] += sig[: e - s]


def _timbre(rng, kind):
    if kind == "pad":
        h = rng.dirichlet(np.ones(10) * 0.8)
        return dict(h=h * 1.4, attack=rng.uniform(0.08, 0.4), decay=rng.uniform(1.0, 3.0), sustain=rng.uniform(0.3, 0.7), detune=rng.uniform(0, 0.006))
    if kind == "pluck":
        h = rng.dirichlet(np.ones(8) * 0.5)
        return dict(h=h, attack=0.004, decay=rng.uniform(0.12, 0.5), sustain=0.0, detune=0.0)
    if kind == "organ":
        h = np.zeros(8)
        h[[0, 1, 2, 3, 5, 7]] = rng.uniform(0.1, 1, 6)
        return dict(h=h / h.sum(), attack=0.02, decay=1.0, sustain=0.9, detune=rng.uniform(0, 0.003))
    if kind == "lead":
        h = rng.dirichlet(np.ones(7) * rng.uniform(0.4, 1.5))
        return dict(h=h, attack=rng.uniform(0.005, 0.05), decay=rng.uniform(0.2, 0.8), sustain=rng.uniform(0.2, 0.7), detune=rng.uniform(0, 0.004))
    if kind == "vocal":
        # vowel-like spectrum: strong low harmonics with a formant bump
        h = np.exp(-np.arange(12) / rng.uniform(1.5, 3.5))
        bump = int(rng.integers(2, 6))
        h[bump] += rng.uniform(0.3, 0.8)
        return dict(h=h / h.sum(), attack=0.04, decay=0.6, sustain=0.6, detune=0.0)
    raise ValueError(kind)


def _drum_kit(rng):
    k_hi, k_lo = rng.uniform(70, 150), rng.uniform(40, 65)
    snare_f = rng.uniform(150, 260)
    snare_noise = rng.uniform(0.4, 0.8)
    hat_decay = rng.uniform(40, 120)
    t = np.arange(int(0.3 * SR)) / SR
    f = k_lo + k_hi * np.exp(-t * rng.uniform(20, 40))
    kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * rng.uniform(8, 16))
    noise = rng.standard_normal(int(0.25 * SR))
    ts = np.arange(len(noise)) / SR
    snare = (noise * snare_noise + np.sin(2 * np.pi * snare_f * ts) * (1 - snare_noise)) * np.exp(-ts * rng.uniform(14, 26))
    hn = np.diff(np.concatenate([[0], rng.standard_normal(int(0.06 * SR))]))
    hat = hn * np.exp(-np.arange(len(hn)) / SR * hat_decay) * 0.35
    return kick, snare, hat


def _progression(rng, n_scale, length):
    """Scale degrees of chord roots, starting on the tonic or another stable chord."""
    common = [0, 3, 4, 5, 1, 2, 6]  # I, IV, V, vi, ii, iii, vii by rough frequency of use
    weights = np.array([0.24, 0.2, 0.2, 0.16, 0.1, 0.06, 0.04])
    prog = [int(rng.choice([0, 0, 5, 3]))]
    while len(prog) < length:
        d = int(rng.choice(common, p=weights))
        if d != prog[-1]:
            prog.append(d)
    return [d % n_scale for d in prog]


def _melody(rng, length_steps, scale_len, density, leap):
    """A phrase: (step, degree, duration in steps) over a 16th grid."""
    notes = []
    deg = int(rng.integers(0, scale_len))
    s = 0
    while s < length_steps:
        dur = int(rng.choice([1, 2, 2, 3, 4, 4, 6, 8]))
        if rng.random() < density:
            move = int(rng.choice([-2, -1, -1, 0, 1, 1, 2] + ([-4, 4, 3, -3] if rng.random() < leap else [])))
            deg = int(np.clip(deg + move, -3, scale_len + 5))
            notes.append((s, deg, dur))
        s += dur
    return notes


def make_song(seed: int, seconds: float = 150, sr: int = 16000) -> np.ndarray:
    """`sr` 8000 renders straight at the recognizer's rate (no resampling) for big catalogues."""
    global SR
    SR = sr
    try:
        return _make_song(seed, seconds)
    finally:
        SR = 16000


def _make_song(seed: int, seconds: float) -> np.ndarray:
    rng = np.random.default_rng(seed + 7_000_000)
    cache: dict = {}

    def tone(voice, midi, dur, **kw):
        key = (voice, int(midi), int(dur * SR))
        if key not in cache:
            tb = kw
            cache[key] = _tone(midi_hz(midi), dur, tb["h"], tb["attack"], tb["decay"], tb["sustain"], vibrato=tb.get("vibrato", 0.0), detune=tb.get("detune", 0.0))
        return cache[key]

    key = int(rng.integers(0, 12))
    mode_name = list(MODES)[int(rng.choice(len(MODES), p=[0.42, 0.3, 0.1, 0.1, 0.08]))]
    scale = MODES[mode_name]
    bpm = float(rng.uniform(68, 172))
    beats_per_bar = 3 if rng.random() < 0.12 else 4
    beat = 60 / bpm
    step = beat / 4
    swing = rng.uniform(0, 0.33) if rng.random() < 0.35 else 0.0
    tonic = 48 + key  # C3 + key

    def note_of(deg, octave=0):
        o, d = divmod(deg, len(scale))
        return tonic + 12 * (o + octave) + scale[d]

    # song form: sections with their own progression, chord rate, drums, melody
    names = ["intro", "verse", "chorus", "verse", "chorus", "bridge", "chorus", "outro"]
    sections = {}
    for name in dict.fromkeys(names):  # not set(): its order changes between processes
        plen = int(rng.choice([2, 3, 4, 4, 4, 6, 8]))
        sections[name] = dict(
            prog=_progression(rng, len(scale), plen),
            bars_per_chord=int(rng.choice([1, 1, 2, 2, 1])) if plen <= 4 else 1,
            drums=(rng.random() < 0.85) and name not in ("intro",) or (rng.random() < 0.3),
            grid=dict(kick=rng.random(16) < rng.uniform(0.15, 0.4), snare=rng.random(16) < rng.uniform(0.05, 0.2), hat=rng.random(16) < rng.uniform(0.3, 0.9)),
            melody=_melody(rng, beats_per_bar * 4 * 2, len(scale), rng.uniform(0.55, 0.9), rng.uniform(0.1, 0.4)),
            lead_octave=int(rng.choice([1, 1, 2])),
        )
        sections[name]["grid"]["kick"][0] = True
        sections[name]["grid"]["snare"][(beats_per_bar // 2) * 4] = beats_per_bar == 4
    voices = ["bass"] + list(rng.choice(["pad", "pluck", "organ"], size=int(rng.integers(1, 3)), replace=False))
    lead_kind = "vocal" if rng.random() < 0.5 else "lead"
    timbres = {v: _timbre(rng, v) for v in voices if v != "bass"}
    timbres["lead"] = _timbre(rng, lead_kind)
    bass_style = rng.choice(["root", "root-fifth", "walking", "octaves"])
    bass_h = rng.dirichlet(np.ones(5) * 0.7)
    arpeggio = rng.random() < 0.4
    kick, snare, hat = _drum_kit(rng)
    mix = dict(bass=rng.uniform(0.3, 0.55), pad=rng.uniform(0.08, 0.16), pluck=rng.uniform(0.1, 0.2), organ=rng.uniform(0.07, 0.14), lead=rng.uniform(0.16, 0.3), drums=rng.uniform(0.5, 0.9))

    buf = np.zeros(int(seconds * SR))
    bar_len = beat * beats_per_bar
    n_bars = int(seconds / bar_len) + 1
    # bars per section, repeated over the form until the song is long enough
    form = []
    while len(form) < n_bars:
        for name in names:
            form += [name] * int(rng.choice([4, 8, 8])) if name not in ("intro", "outro") else [name] * 4
    form = form[:n_bars]
    vib = rng.uniform(0.002, 0.006) if lead_kind == "vocal" else rng.uniform(0, 0.002)
    bar_in_section = 0
    for b, name in enumerate(form):
        bar_in_section = bar_in_section + 1 if b and form[b - 1] == name else 0
        sec = sections[name]
        t0 = b * bar_len * SR
        chord_idx = (bar_in_section // sec["bars_per_chord"]) % len(sec["prog"])
        root_deg = sec["prog"][chord_idx]
        chord = [note_of(root_deg + i) for i in (0, 2, 4)]
        # drums
        if sec["drums"]:
            for s16 in range(beats_per_bar * 4):
                ts = t0 + (s16 * step + (swing * step if s16 % 2 else 0)) * SR
                g = s16 % 16
                if sec["grid"]["kick"][g]:
                    _add(buf, kick * mix["drums"], ts)
                if sec["grid"]["snare"][g]:
                    _add(buf, snare * mix["drums"] * 0.55, ts)
                if sec["grid"]["hat"][g]:
                    _add(buf, hat * mix["drums"] * rng.uniform(0.6, 1.0), ts)
        # bass
        for bt in range(beats_per_bar):
            if bass_style == "root":
                n = chord[0] - 12
            elif bass_style == "root-fifth":
                n = chord[0] - 12 + (7 if bt % 2 else 0)
            elif bass_style == "octaves":
                n = chord[0] - 12 + (12 if bt % 2 else 0)
            else:
                n = note_of(root_deg + int(rng.choice([0, 1, 2, -1])), -1)
            _add(buf, tone("bass", n, beat * 0.9, h=bass_h, attack=0.01, decay=0.35, sustain=0.4) * mix["bass"], t0 + bt * beat * SR)
        # harmony
        if bar_in_section % sec["bars_per_chord"] == 0:
            dur = bar_len * sec["bars_per_chord"]
            for v in voices:
                if v == "bass":
                    continue
                tb = timbres[v]
                if v == "pluck" and arpeggio:
                    for k in range(int(dur / (step * 2))):
                        n = chord[k % 3] + 12 * (k // 3 % 2)
                        _add(buf, tone(v, n + 12, step * 2, **{**tb, "detune": 0.0}) * mix[v], t0 + k * step * 2 * SR)
                else:
                    for n in chord:
                        _add(buf, tone(v, n + 12, dur, **tb) * mix[v], t0)
        # lead melody: two-bar phrase, varied on repeats
        if name in ("intro", "outro") and rng.random() < 0.6:
            continue
        phrase_steps = beats_per_bar * 4
        half = bar_in_section % 2
        tb = timbres["lead"]
        for s, deg, dur in sec["melody"]:
            if not (half * phrase_steps <= s < (half + 1) * phrase_steps):
                continue
            var = int(rng.choice([0, 0, 0, 1, -1])) if bar_in_section >= 2 else 0
            n = note_of(deg + var, sec["lead_octave"])
            ts = t0 + ((s - half * phrase_steps) * step) * SR
            _add(buf, tone("lead", n, dur * step * 0.95, **tb, vibrato=vib) * mix["lead"], ts)

    if rng.random() < 0.5:  # a little room
        tail = int(rng.uniform(0.2, 0.8) * SR)
        ir = rng.standard_normal(tail) * np.exp(-np.arange(tail) / (tail / 5))
        ir[0] = 1.0
        wet = rng.uniform(0.05, 0.2)
        from scipy.signal import fftconvolve

        buf = buf + wet * fftconvolve(buf, ir / np.abs(ir).sum() * 10)[: len(buf)]
    buf /= np.max(np.abs(buf)) + 1e-9
    return (buf * 0.9).astype(np.float32)


if __name__ == "__main__":
    import sys
    import time

    import soundfile as sf

    for s in map(int, sys.argv[1:] or ["1"]):
        t = time.time()
        y = make_song(s, 60)
        sf.write(f"/tmp/synth2-{s}.wav", y, SR)
        print(s, f"{time.time() - t:.2f}s")
