"""Stage A for large catalogues: a shortlist in ONE pass, whatever the speed
and pitch of the post.

Three spectral peaks a, b, c (log-frequency axis, in time order) give a key
that doesn't change when audio is sped up, slowed, time-stretched or
pitch-shifted:
- the frequency steps fb - fa and fc - fb (a pitch shift moves all three
  peaks by the same number of log bins);
- the time ratio dt1 / (dt1 + dt2) (a speed change scales both gaps alike);
- optionally a coarse band of fa (`BAND`), probed at its neighbours, which
  adds entropy at the cost of more lookups.
Each matching triplet also says how fast the post plays the song (span in
the song / span in the post) and where in the song it is, so votes are
counted per (song, speed, offset) cell: random collisions spread out, the
real song piles up in one cell.

The precise check (`bekvor_fp.match` on the shortlisted songs) stays as is.
"""
from __future__ import annotations

import numpy as np

DT_MIN, DT_MAX = 3, 40
DF_MAX = 30
LOOKAHEAD = 6
RATIO_LEVELS = 16
SPEED_BINS_PER_OCTAVE = 24
OFFSET_FRAMES = 16
MAX_POSTINGS = 50_000
BAND = 0  # 0: no band in the key
PROBE_DF = 0  # query probes neighbouring frequency-step cells
PROBE_R = 0  # ... and neighbouring ratio cells
DF_Q = 1  # frequency steps are divided by this (tolerance to rounding after a shift)


def components(pk: np.ndarray, per_anchor: int = 3):
    """(df1, df2, dt1, dt2, anchor frame, anchor bin) for peak triplets. `pk`: (frame, logbin) rows by time."""
    n = len(pk)
    z = np.zeros(0, np.int64)
    if n < 3:
        return z, z, z, z, z, z
    t = np.round(pk[:, 0]).astype(np.int64)
    f = np.round(pk[:, 1]).astype(np.int64)
    L = min(LOOKAHEAD, n - 1)
    out = [[] for _ in range(6)]
    # LOOKAHEAD counts peaks; with ~1 peak per frame, a wide lookahead is needed to reach DT_MAX
    count = np.zeros(n, np.int64)
    for j in range(1, L + 1):
        for k in range(j + 1, L + 1):
            a = np.arange(n - k)
            b, c = a + j, a + k
            dt1, dt2 = t[b] - t[a], t[c] - t[b]
            df1, df2 = f[b] - f[a], f[c] - f[b]
            ok = (dt1 >= DT_MIN) & (dt2 >= DT_MIN) & (dt1 <= DT_MAX) & (dt2 <= DT_MAX)
            ok &= (np.abs(df1) <= DF_MAX) & (np.abs(df2) <= DF_MAX) & (count[a] < per_anchor)
            a = a[ok]
            np.add.at(count, a, 1)
            for lst, v in zip(out, (df1[ok], df2[ok], dt1[ok], dt2[ok], t[a], f[a])):
                lst.append(v)
    return tuple(np.concatenate(v) for v in out)


def make_keys(df1, df2, dt1, dt2, p1=0, p2=0, pr=0):
    """Quantised key; p1/p2/pr move to a neighbouring cell (query-side probing)."""
    q1 = np.floor_divide(df1 + 32 * DF_Q, DF_Q) + p1
    q2 = np.floor_divide(df2 + 32 * DF_Q, DF_Q) + p2
    r = np.clip(RATIO_LEVELS * dt1 // (dt1 + dt2) + pr, 0, RATIO_LEVELS - 1)
    key = (q1 << 10) | (q2 << 4) | r
    return key


def triplets(pk: np.ndarray, per_anchor: int = 3):
    df1, df2, dt1, dt2, ta, fa = components(pk, per_anchor)
    return make_keys(df1, df2, dt1, dt2), ta, dt1 + dt2, fa


def _with_band(keys, fa, shift=0):
    if not BAND:
        return keys
    return (keys << 4) | ((fa // BAND + shift) & 15)



class ShortlistIndex:
    def __init__(self, songs: list[np.ndarray], per_anchor: int = 3):
        K, T, P, S = [], [], [], []
        for sid, pk in enumerate(songs):
            keys, ta, spans, fa = triplets(pk, per_anchor)
            K.append(_with_band(keys, fa))
            T.append(ta)
            P.append(spans)
            S.append(np.full(len(keys), sid, np.int32))
        K = np.concatenate(K)
        order = np.argsort(K, kind="stable")
        K = K[order]
        self.T = np.concatenate(T)[order].astype(np.int32)
        self.P = np.concatenate(P)[order].astype(np.int16)
        self.S = np.concatenate(S)[order]
        self.Ku, self.starts, self.counts = np.unique(K, return_index=True, return_counts=True)
        self.n = len(songs)
        self.postings = len(K)

    def nbytes(self) -> int:
        return sum(a.nbytes for a in (self.T, self.P, self.S, self.Ku, self.starts, self.counts))

    def shortlist(self, pk: np.ndarray, top: int = 50, per_anchor: int = 6):
        df1, df2, dt1, dt2, tq, fa = components(pk, per_anchor)
        probes = [(a, b, c) for a in range(-PROBE_DF, PROBE_DF + 1) for b in range(-PROBE_DF, PROBE_DF + 1) for c in range(-PROBE_R, PROBE_R + 1)]
        bands = (-1, 0, 1) if BAND else (0,)
        keys = np.concatenate([_with_band(make_keys(df1, df2, dt1, dt2, *p), fa, d) for p in probes for d in bands])
        n = len(probes) * len(bands)
        return self._vote(keys, np.tile(tq, n), np.tile(dt1 + dt2, n), top)

    def _vote(self, keys, tq, sq, top):
        if len(keys) == 0 or len(self.Ku) == 0:
            return np.zeros(0, np.int64), np.zeros(0)
        pos = np.minimum(np.searchsorted(self.Ku, keys), len(self.Ku) - 1)
        hit = (self.Ku[pos] == keys) & (self.counts[pos] <= MAX_POSTINGS)
        start, cnt = self.starts[pos[hit]], self.counts[pos[hit]]
        tq, sq = tq[hit], sq[hit]
        total = int(cnt.sum())
        if total == 0:
            return np.zeros(0, np.int64), np.zeros(0)
        idx = np.repeat(start, cnt) + (np.arange(total) - np.repeat(np.cumsum(cnt) - cnt, cnt))
        speed = self.P[idx] / np.repeat(sq, cnt)
        ok = (speed > 0.74) & (speed < 1.36)
        idx, speed = idx[ok], speed[ok]
        song = self.S[idx].astype(np.int64)
        tqr = np.repeat(tq, cnt)[ok]
        sbin = np.round(np.log2(speed) * SPEED_BINS_PER_OCTAVE).astype(np.int64) + 16
        offset = np.floor((self.T[idx] - tqr * speed) / OFFSET_FRAMES).astype(np.int64)
        key = (song * 64 + sbin) * (1 << 16) + (offset + (1 << 15))
        uk, c = np.unique(key, return_counts=True)
        sc = c.astype(np.float64)
        for d in (1, -1, 1 << 16, -(1 << 16)):
            p = np.searchsorted(uk, uk + d)
            okp = (p < len(uk)) & (uk[np.minimum(p, len(uk) - 1)] == uk + d)
            sc[okp] += 0.5 * c[p[okp]]
        sid = uk // (64 * (1 << 16))
        best = np.zeros(self.n)
        np.maximum.at(best, sid, sc)
        order = np.argsort(-best)[:top]
        return order, best[order]
