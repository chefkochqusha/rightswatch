"""Catalogue-only audio fingerprinting prototype (landmark pairs on a log-frequency
spectrogram). Log frequency makes a pitch shift a plain translation of the
frequency axis, so sped-up / slowed (resampled), time-stretched and
pitch-shifted clips can be matched by searching a small grid of
(speed, pitch-offset) transforms on the query's peaks — no re-analysis of audio.

Own implementation (numpy/scipy only), so no third-party licence applies."""
import time
from collections import defaultdict

import numpy as np
import os
from scipy.ndimage import maximum_filter, median_filter
from scipy.signal import resample_poly, stft

FS = 8000
NFFT = 1024
HOP = 256
FMIN, FMAX = 80.0, 3800.0
BPO = 24  # log bins per octave (quarter tones)
NLOG = int(np.floor(BPO * np.log2(FMAX / FMIN)))
PEAKS_PER_SEC = 30
FANOUT = 8
DT_MIN, DT_MAX = 2, 50
DF_MAX = 30
FRAME_SEC = HOP / FS


def _log_matrix():
    freqs = np.fft.rfftfreq(NFFT, 1 / FS)
    centers = FMIN * 2 ** (np.arange(NLOG) / BPO)
    m = np.zeros((NLOG, len(freqs)))
    for i, c in enumerate(centers):
        lo, hi = c * 2 ** (-1 / BPO), c * 2 ** (1 / BPO)
        w = np.clip(1 - np.abs(np.log2(np.maximum(freqs, 1e-3) / c)) * BPO, 0, None)
        w[(freqs < lo) | (freqs > hi)] = 0
        if w.sum() == 0:  # low end: nearest linear bin
            w[np.argmin(np.abs(freqs - c))] = 1
        m[i] = w / w.sum()
    return m


LOGM = _log_matrix()


def to_fs(x, sr):
    if sr == FS:
        return x
    g = np.gcd(int(sr), FS)
    return resample_poly(x, FS // g, int(sr) // g)


def peaks(x, sr, per_sec=PEAKS_PER_SEC):
    """Return array of (frame, logbin) peaks."""
    y = to_fs(np.asarray(x, dtype=np.float64), sr)
    _, _, Z = stft(y, fs=FS, nperseg=NFFT, noverlap=NFFT - HOP, boundary=None, padded=False)
    M = np.abs(Z)
    if os.environ.get("FP_HARMONIC", "1") == "1":
        # keep tonal content (melody, chords, bass), drop drums: shared drum samples
        # across songs otherwise produce look-alike hashes
        H = median_filter(M, size=(1, 17))
        P = median_filter(M, size=(17, 1))
        M = M * (H ** 2 / (H ** 2 + P ** 2 + 1e-12))
    S = np.log(LOGM @ M + 1e-6)
    S -= np.median(S, axis=1, keepdims=True)  # whiten per band
    local = maximum_filter(S, size=(7, 9)) == S
    cand = np.argwhere(local & (S > 0.5))  # (freq, frame)
    if len(cand) == 0:
        return np.zeros((0, 2), dtype=np.int32)
    vals = S[cand[:, 0], cand[:, 1]]
    frames_per_sec = int(round(1 / FRAME_SEC))
    keep = []
    block = cand[:, 1] // frames_per_sec
    for b in np.unique(block):
        idx = np.where(block == b)[0]
        top = idx[np.argsort(-vals[idx])[:per_sec]]
        keep.append(top)
    sel = cand[np.concatenate(keep)]
    out = np.stack([sel[:, 1], sel[:, 0]], axis=1).astype(np.float64)  # (t, f)
    return out[np.argsort(out[:, 0])]


def pair_hashes(pk):
    """Yield (hash, t_anchor) from peaks (t,f) that may be fractional (after transforms)."""
    t = np.round(pk[:, 0]).astype(np.int64)
    f = np.round(pk[:, 1]).astype(np.int64)
    n = len(t)
    hs, ts = [], []
    for i in range(n):
        cnt = 0
        for j in range(i + 1, n):
            dt = t[j] - t[i]
            if dt < DT_MIN:
                continue
            if dt > DT_MAX or cnt >= FANOUT:
                break
            df = f[j] - f[i]
            if abs(df) > DF_MAX or f[i] < 0 or f[i] >= 256:
                continue
            hs.append((int(f[i]) << 13) | ((int(df) + 64) << 6) | int(dt))
            ts.append(int(t[i]))
            cnt += 1
    return hs, ts


class Index:
    def __init__(self):
        self.table = defaultdict(list)
        self.names = []
        self.sizes = []

    def add(self, name, x, sr):
        sid = len(self.names)
        self.names.append(name)
        hs, ts = pair_hashes(peaks(x, sr))
        for h, t in zip(hs, ts):
            self.table[h].append((sid, t))
        self.sizes.append(len(hs))
        return len(hs)

    def finalize(self):
        """Rarity weights: a hash many songs share (a common chord, a stock drum hit)
        says little; one only this song has says a lot (inverse document frequency)."""
        n = max(1, len(self.names))
        self.weight = {}
        for h, posts in self.table.items():
            df = len({sid for sid, _ in posts})
            self.weight[h] = float(np.log((n + 1) / df)) if os.environ.get("FP_IDF", "1") == "1" else 1.0

    def _score(self, qpk):
        hs, ts = pair_hashes(qpk)
        votes = defaultdict(lambda: defaultdict(float))
        if not hasattr(self, "weight"):
            self.finalize()
        for h, tq in zip(hs, ts):
            posts = self.table.get(h)
            if not posts:
                continue
            w = self.weight[h]
            for sid, tr in posts:
                votes[sid][tr - tq] += w
        best = []
        for sid, hist in votes.items():
            # allow ±1 frame jitter in the alignment
            s = max(hist.get(o - 1, 0) + c + hist.get(o + 1, 0) for o, c in hist.items())
            best.append((round(s, 1), sid))
        return sorted(best, reverse=True)[:3], len(hs)

    def query(self, x, sr, robust=True):
        """Best match across the transform grid. Returns dict with name, score, second, speed, shift."""
        t0 = time.time()
        qpk = peaks(x, sr, int(os.environ.get('FP_QUERY_DENSITY', PEAKS_PER_SEC)))
        combos = [(1.0, 0)]
        if robust:
            for s in np.exp(np.linspace(np.log(0.78), np.log(1.32), 29)):
                combos.append((float(s), 0))  # time-stretch only (pitch kept)
                combos.append((float(s), int(round(BPO * np.log2(s)))))  # resample: speed and pitch together
            for k in range(-8, 9):
                combos.append((1.0, k))  # pitch-only, up to ±4 semitones
        best = {"score": 0, "sid": None, "second": 0, "speed": 1.0, "shift": 0, "nq": 0}
        seen = set()
        for s, k in combos:
            if (round(s, 4), k) in seen:
                continue
            seen.add((round(s, 4), k))
            pk = qpk.copy()
            pk[:, 0] *= s  # query frame -> reference frame
            pk[:, 1] -= k
            top, nq = self._score(pk)
            if top and top[0][0] > best["score"]:
                second = top[1][0] if len(top) > 1 else 0
                best = {"score": top[0][0], "sid": top[0][1], "second": second, "speed": s, "shift": k, "nq": nq}
        best["name"] = self.names[best["sid"]] if best["sid"] is not None else None
        best["ms"] = round((time.time() - t0) * 1000)
        return best
