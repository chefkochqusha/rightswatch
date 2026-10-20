"""Stage 1 for large catalogues: a shortlist of songs in ONE pass over the
index, whatever the speed and pitch of the post.

The precise check (`bekvor_fp.match`) tries 76 speed/pitch transforms
against every song; its cost grows with the catalogue (7.5 s per post at 300
songs, minutes at 20,000). So above a few hundred songs, this module first
picks the ~50 most likely songs and the precise check runs on those only.

Three spectral peaks a, b, c (log-frequency axis, in time order) give a key
that a speed or pitch change leaves alone:
- the frequency steps fb - fa and fc - fb: a pitch shift moves all three
  peaks by the same number of log bins;
- the time ratio dt1 / (dt1 + dt2), in 16 steps: a speed change scales both
  gaps alike;
- a coarse band of fa (24 bins = one octave), looked up at the neighbouring
  bands as well, so a pitch shift across a band edge still finds it.
Each matching triplet also says how fast the post plays the song (span in
the song / span in the post) and where in the song it is. Votes are counted
per (song, speed, position) cell: chance collisions spread out, the real
song piles up in one cell.

Settings from research (services/recognizer/README.md, "Large catalogues").
"""
from __future__ import annotations

import numpy as np

DT_MIN, DT_MAX = 4, 40  # frames between peaks (0.13-1.28 s)
DF_MAX = 30  # log bins (15 semitones)
LOOKAHEAD = 30  # later peaks considered (about one per frame, so ~1 s)
RATIO_LEVELS = 16
BAND = 24
REF_PER_ANCHOR = 4  # triplets per peak stored for a song
QUERY_PER_ANCHOR = 8  # ... and looked up for a post
SPEED_MIN, SPEED_MAX = 0.74, 1.36
SPEED_BINS_PER_OCTAVE = 24
OFFSET_FRAMES = 16  # ~0.5 s cells for the song position
MAX_POSTINGS = 50_000  # keys this common say nothing and cost time


try:  # compiled when numba is installed (the Docker image has it): ~25x faster
    from numba import njit
except ImportError:  # pragma: no cover - plain numpy fallback below
    njit = None


def _components_loop(t, f, per_anchor, lookahead, dt_min, dt_max, df_max):
    """Per anchor, the first `per_anchor` valid triplets in (j, k) order:
    the same triplets as the numpy version, grouped by anchor."""
    n = len(t)
    out = np.empty((6, n * per_anchor), np.int64)
    m = 0
    for a in range(n):
        got = 0
        for j in range(1, lookahead + 1):
            b = a + j
            if b >= n or got >= per_anchor:
                break
            dt1 = t[b] - t[a]
            if dt1 > dt_max:
                break
            for k in range(j + 1, lookahead + 1):
                c = a + k
                if c >= n:
                    break
                dt2 = t[c] - t[b]
                if dt2 > dt_max:
                    break
                if dt1 < dt_min or dt2 < dt_min:
                    continue
                df1 = f[b] - f[a]
                df2 = f[c] - f[b]
                if abs(df1) > df_max or abs(df2) > df_max:
                    continue
                out[0, m] = df1
                out[1, m] = df2
                out[2, m] = dt1
                out[3, m] = dt2
                out[4, m] = t[a]
                out[5, m] = f[a]
                m += 1
                got += 1
                if got >= per_anchor:
                    break
    return out[:, :m]


_components_fast = njit(cache=True, nogil=True)(_components_loop) if njit else None


def components(pk: np.ndarray, per_anchor: int):
    """(df1, df2, dt1, dt2, anchor frame, anchor bin) for peak triplets.
    `pk`: (frame, logbin) rows in time order."""
    if _components_fast is not None and len(pk) >= 3:
        t = np.round(pk[:, 0]).astype(np.int64)
        f = np.round(pk[:, 1]).astype(np.int64)
        o = _components_fast(t, f, per_anchor, LOOKAHEAD, DT_MIN, DT_MAX, DF_MAX)
        return o[0], o[1], o[2], o[3], o[4], o[5]
    return _components_numpy(pk, per_anchor)


def _components_numpy(pk: np.ndarray, per_anchor: int):
    n = len(pk)
    z = np.zeros(0, np.int64)
    if n < 3:
        return z, z, z, z, z, z
    t = np.round(pk[:, 0]).astype(np.int64)
    f = np.round(pk[:, 1]).astype(np.int64)
    L = min(LOOKAHEAD, n - 1)
    out = [[] for _ in range(6)]
    count = np.zeros(n, np.int64)
    for j in range(1, L + 1):
        for k in range(j + 1, L + 1):
            a = np.arange(n - k)
            b, c = a + j, a + k
            dt1, dt2 = t[b] - t[a], t[c] - t[b]
            ok = (dt1 >= DT_MIN) & (dt2 >= DT_MIN) & (dt1 <= DT_MAX) & (dt2 <= DT_MAX)
            if not ok.any():
                continue
            df1, df2 = f[b] - f[a], f[c] - f[b]
            ok &= (np.abs(df1) <= DF_MAX) & (np.abs(df2) <= DF_MAX) & (count[a] < per_anchor)
            a = a[ok]
            np.add.at(count, a, 1)
            for lst, v in zip(out, (df1[ok], df2[ok], dt1[ok], dt2[ok], t[a], f[a])):
                lst.append(v)
    if not out[0]:
        return z, z, z, z, z, z
    return tuple(np.concatenate(v) for v in out)


def keys_for(df1, df2, dt1, dt2, fa, band_shift: int = 0) -> np.ndarray:
    ratio = np.minimum(RATIO_LEVELS - 1, RATIO_LEVELS * dt1 // (dt1 + dt2))
    key = ((df1 + 32) << 10) | ((df2 + 32) << 4) | ratio
    return (key << 4) | ((fa // BAND + band_shift) & 15)


class ShortlistIndex:
    """One workspace's catalogue as triplet postings: per key, which song,
    where (frame) and the triplet's span. About 5 bytes per posting."""

    def __init__(self, songs: list[np.ndarray]):
        # compact types per song straight away: a song's triplets in int64 are
        # ~800 KB, in these ~110 KB
        K, T, P, S = [], [], [], []
        sid_type = np.uint16 if len(songs) < 65536 else np.int32
        for sid, pk in enumerate(songs):
            df1, df2, dt1, dt2, ta, fa = components(pk, REF_PER_ANCHOR)
            K.append(keys_for(df1, df2, dt1, dt2, fa).astype(np.int32))
            T.append(np.minimum(ta, 65535).astype(np.uint16))
            P.append((dt1 + dt2).astype(np.uint8))
            S.append(np.full(len(df1), sid, sid_type))
        self.n = len(songs)
        K = np.concatenate(K) if K else np.zeros(0, np.int32)
        order = np.argsort(K, kind="stable")
        K = K[order]
        self.T = np.concatenate(T)[order] if len(K) else np.zeros(0, np.uint16)
        self.P = np.concatenate(P)[order] if len(K) else np.zeros(0, np.uint8)
        self.S = np.concatenate(S)[order] if len(K) else np.zeros(0, sid_type)
        del T, P, S, order
        first = np.flatnonzero(np.r_[True, K[1:] != K[:-1]]) if len(K) else np.zeros(0, np.int64)
        self.Ku, self.starts = K[first], first.astype(np.int64)
        self.counts = np.diff(np.r_[first, len(K)]).astype(np.int32)
        self.postings = len(K)

    def nbytes(self) -> int:
        return sum(a.nbytes for a in (self.T, self.P, self.S, self.Ku, self.starts, self.counts))

    def shortlist(self, pk: np.ndarray, top: int = 50) -> np.ndarray:
        """Song numbers (positions in `songs`), most likely first."""
        return self.scores(query_keys(pk), top)[0]

    def scores(self, query: tuple[np.ndarray, np.ndarray, np.ndarray] | None, top: int) -> tuple[np.ndarray, np.ndarray]:
        """The `top` songs for a post's prepared keys (`query_keys`), and their scores."""
        songs, best, _ = self.scores_with_speed(query, top)
        return songs, best

    def scores_with_speed(self, query: tuple[np.ndarray, np.ndarray, np.ndarray] | None, top: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """As `scores`, plus each song's speed bin: the speed of its best vote
        cell (song span / post span, `speed_of_bin`). The precise check then
        only needs the transforms near that speed for that song."""
        none = (np.zeros(0, np.int64), np.zeros(0), np.zeros(0, np.int64))
        if query is None or self.n == 0 or len(self.Ku) == 0:
            return none
        keys, tq, sq = query
        pos = np.minimum(np.searchsorted(self.Ku, keys), len(self.Ku) - 1)
        hit = (self.Ku[pos] == keys) & (self.counts[pos] <= MAX_POSTINGS)
        start, cnt = self.starts[pos[hit]], self.counts[pos[hit]].astype(np.int64)
        tq, sq = tq[hit], sq[hit]
        total = int(cnt.sum())
        if total == 0:
            return none
        if _votes_fast is not None:
            # the same votes as below, without the repeated per-posting arrays
            song, speed, offset = _votes_fast(start, cnt, tq.astype(np.int64), sq.astype(np.int64), self.P, self.S, self.T, total, SPEED_MIN, SPEED_MAX, OFFSET_FRAMES)
        else:
            idx = np.repeat(start, cnt) + (np.arange(total) - np.repeat(np.cumsum(cnt) - cnt, cnt))
            speed = self.P[idx] / np.repeat(sq, cnt)
            ok = (speed > SPEED_MIN) & (speed < SPEED_MAX)
            idx, speed = idx[ok], speed[ok]
            tqr = np.repeat(tq, cnt)[ok]
            song = self.S[idx].astype(np.int64)
            offset = np.floor((self.T[idx] - tqr * speed) / OFFSET_FRAMES).astype(np.int64)
        sbin = np.round(np.log2(speed) * SPEED_BINS_PER_OCTAVE).astype(np.int64) + SPEED_BIN_ZERO
        cell = (song * 64 + sbin) * (1 << 16) + (offset + (1 << 15))
        uk, c = np.unique(cell, return_counts=True)
        best, best_cell = (_best_per_song_fast or _best_per_song)(uk, c, self.n)
        order = np.argsort(-best)[:top]
        order = order[best[order] > 0]
        return order, best[order], (best_cell[order] >> 16) % 64


SPEED_BIN_ZERO = 16  # the speed bin of speed 1.0 in a vote cell


def speed_of_bin(sbin: int) -> float:
    """The speed (song span / post span) at the centre of a speed bin."""
    return float(2 ** ((sbin - SPEED_BIN_ZERO) / SPEED_BINS_PER_OCTAVE))


def _votes_loop(start, cnt, tq, sq, P, S, T, total, speed_min, speed_max, offset_frames):
    """Per matching posting within the speed range: its song, the speed it
    implies and the song position (in `OFFSET_FRAMES` cells), with the same
    arithmetic as the numpy version in `ShortlistIndex.scores`."""
    song = np.empty(total, np.int64)
    speed = np.empty(total, np.float64)
    offset = np.empty(total, np.int64)
    m = 0
    for h in range(len(start)):
        span_q = np.float64(sq[h])
        tqh = tq[h]
        for p in range(start[h], start[h] + cnt[h]):
            s = np.float64(P[p]) / span_q
            if s > speed_min and s < speed_max:
                song[m] = S[p]
                speed[m] = s
                offset[m] = np.int64(np.floor((np.float64(T[p]) - tqh * s) / offset_frames))
                m += 1
    return song[:m], speed[:m], offset[:m]


_votes_fast = njit(cache=True, nogil=True)(_votes_loop) if njit else None


def _best_per_song(uk: np.ndarray, c: np.ndarray, n: int) -> tuple[np.ndarray, np.ndarray]:
    """Per song, its best cell's votes, where a neighbouring speed or position
    cell of the same song counts half, and which cell that is (the lowest
    of equal ones). `uk`: the sorted, distinct cells."""
    score = c.astype(np.float64)
    for d in (1, -1, 1 << 16, -(1 << 16)):
        p = np.searchsorted(uk, uk + d)
        okp = (p < len(uk)) & (uk[np.minimum(p, len(uk) - 1)] == uk + d)
        score[okp] += 0.5 * c[p[okp]]
    sid = uk // (64 * (1 << 16))
    best = np.zeros(n)
    best_cell = np.zeros(n, np.int64)
    if len(uk):
        order = np.lexsort((-score, sid))  # by song, best first, then lowest cell (stable)
        first = order[np.r_[True, sid[order][1:] != sid[order][:-1]]]
        best[sid[first]] = score[first]
        best_cell[sid[first]] = uk[first]
    return best, best_cell


def _best_per_song_loop(uk, c, n):
    """`_best_per_song` in one pass: `uk` is sorted, so the cell one position
    over is the next or previous entry, and the cell one speed step over is
    found by a pointer that only moves forward. Adds the halves in the same
    order, so the scores are identical; a later cell replaces the best only
    when strictly better, so ties keep the lowest cell, as the numpy version."""
    m = len(uk)
    best = np.zeros(n)
    best_cell = np.zeros(n, np.int64)
    up = 0
    down = 0
    step = np.int64(1) << 16
    for i in range(m):
        key = uk[i]
        s = np.float64(c[i])
        if i + 1 < m and uk[i + 1] == key + 1:
            s += 0.5 * c[i + 1]
        if i > 0 and uk[i - 1] == key - 1:
            s += 0.5 * c[i - 1]
        while up < m and uk[up] < key + step:
            up += 1
        if up < m and uk[up] == key + step:
            s += 0.5 * c[up]
        while down < m and uk[down] < key - step:
            down += 1
        if down < m and uk[down] == key - step:
            s += 0.5 * c[down]
        sid = key // (64 * step)
        if s > best[sid]:
            best[sid] = s
            best_cell[sid] = key
    return best, best_cell


_best_per_song_fast = njit(cache=True, nogil=True)(_best_per_song_loop) if njit else None


def query_keys(pk: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray] | None:
    """A post's triplet keys (at its own band and the neighbouring ones),
    with each triplet's anchor frame and span: made once, looked up in every shard."""
    df1, df2, dt1, dt2, tq, fa = components(pk, QUERY_PER_ANCHOR)
    if len(df1) == 0:
        return None
    keys = np.concatenate([keys_for(df1, df2, dt1, dt2, fa, d) for d in (-1, 0, 1)])
    return keys, np.tile(tq, 3), np.tile(dt1 + dt2, 3)


SHARD_SIZE = 2000


class ShardedShortlist:
    """The shortlist index in shards. Building one big table for 20,000 songs
    needs several GB for a moment (sorting ~300 million keys); shards keep that
    to a few hundred MB. A post is looked up in each shard and the best songs
    of all shards are merged. Each shard knows which positions (in the
    caller's numbering) its songs have, so the caller can reuse an unchanged
    shard when the catalogue changes (`bekvor_fp.Index`)."""

    def __init__(self, shards: list[tuple[np.ndarray, ShortlistIndex]]):
        self.shards = shards
        self.n = sum(len(positions) for positions, _ in shards)

    @classmethod
    def build(cls, songs: list[np.ndarray], shard_size: int = SHARD_SIZE) -> "ShardedShortlist":
        """Consecutive shards of `shard_size` songs; positions are list indices."""
        return cls([
            (np.arange(i, min(i + shard_size, len(songs))), ShortlistIndex(songs[i:i + shard_size]))
            for i in range(0, len(songs), shard_size)
        ])

    def nbytes(self) -> int:
        return sum(shard.nbytes() + positions.nbytes for positions, shard in self.shards)

    def shortlist(self, pk: np.ndarray, top: int = 50) -> np.ndarray:
        """Positions of the `top` most likely songs, best first."""
        return self.shortlist_with_speed(pk, top)[0]

    def shortlist_with_speed(self, pk: np.ndarray, top: int = 50) -> tuple[np.ndarray, np.ndarray]:
        """As `shortlist`, plus each song's speed bin (`speed_of_bin`)."""
        found, bins, _ = self.shortlist_scored(pk, top)
        return found, bins

    def shortlist_scored(self, pk: np.ndarray, top: int = 50) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """As `shortlist_with_speed`, plus each song's vote score."""
        query = query_keys(pk)
        found, scores, bins = [], [], []
        for positions, shard in self.shards:
            songs, sc, sb = shard.scores_with_speed(query, top)
            found.append(positions[songs])
            scores.append(sc)
            bins.append(sb)
        if not found:
            return np.zeros(0, np.int64), np.zeros(0, np.int64), np.zeros(0)
        found, scores, bins = np.concatenate(found), np.concatenate(scores), np.concatenate(bins)
        order = np.argsort(-scores, kind="stable")[:top]
        return found[order], bins[order], scores[order]
