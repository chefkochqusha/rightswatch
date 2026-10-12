"""Bekvor's own song recognition: finds a customer's catalogue songs in a
post's audio, without a paid recognition service.

Method (developed in research/fingerprint, see its README for the results):
landmark pairs of spectral peaks on a log-frequency spectrogram, tonal
content only. Log frequency makes a pitch shift a plain shift of the
frequency axis, so sped-up, slowed, time-stretched and pitch-shifted uses
are found by trying a small grid of (speed, pitch) transforms on the
query's peaks, without analysing the audio again. Hashes that many songs
share count less (inverse document frequency).

Compared with the prototype, this version is vectorised with numpy (the
same hashes, much faster), stores fingerprints compactly, and matches a
whole post in two steps: the best transform over the whole clip, then
12-second windows to count in how many parts of the post the song wins.

Own implementation (numpy/scipy only), so no third-party licence applies.
"""
from __future__ import annotations

import hashlib
import os
import subprocess
import tempfile
import zlib

import numpy as np
from scipy.ndimage import maximum_filter, median_filter
from scipy.signal import stft

ALGORITHM = "bekvor-lp-1"

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
LOOKAHEAD = 64  # peaks to look ahead for pairs (covers DT_MAX at PEAKS_PER_SEC)
FRAME_SEC = HOP / FS
MAX_POSTINGS_PER_HASH = 5000  # hashes this common say nothing and cost time

WINDOW_SEC = 12.0
WINDOW_HOP_SEC = 6.0


# ffmpeg demuxers for the containers the app accepts (media-type.ts).
FORMAT_WHITELIST = "mp3,wav,aiff,flac,ogg,aac,mov,mp4,m4a,3gp,3g2,mj2,matroska,webm"


class AudioError(Exception):
    """The file couldn't be read as audio."""


# ---------------------------------------------------------------- decoding

def decode(data: bytes, max_seconds: float, timeout: float = 180.0) -> np.ndarray:
    """Any audio or video file ffmpeg can read -> mono float32 at FS.

    The bytes are written to a private temporary file (MP4 files need
    seeking), decoded with ffmpeg reading no more than `max_seconds`, and
    the file is deleted straight away.
    """
    fd, path = tempfile.mkstemp(prefix="bekvor-", suffix=".bin")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        cmd = [
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
            # Local file only, and only plain audio/video containers: a file
            # posing as a playlist (HLS, concat) can't make ffmpeg fetch URLs
            # or open other files.
            "-protocol_whitelist", "file",
            "-format_whitelist", FORMAT_WHITELIST,
            "-t", str(max_seconds), "-i", path,
            "-vn", "-sn", "-dn", "-ac", "1", "-ar", str(FS), "-f", "s16le", "pipe:1",
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, timeout=timeout, check=False)
        except subprocess.TimeoutExpired as e:
            raise AudioError("Reading the file took too long.") from e
        if proc.returncode != 0 or len(proc.stdout) < FS * 2:  # under a second of audio
            raise AudioError("The file has no readable audio track.")
        return np.frombuffer(proc.stdout, dtype="<i2").astype(np.float32) / 32768.0
    finally:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass


# ------------------------------------------------------------- fingerprints

def _log_matrix() -> np.ndarray:
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


def _tonal_bands(y: np.ndarray) -> np.ndarray:
    """Log-frequency band energies (NLOG x frames) of the tonal part of the audio."""
    _, _, Z = stft(y.astype(np.float64), fs=FS, nperseg=NFFT, noverlap=NFFT - HOP, boundary=None, padded=False)
    M = np.abs(Z)
    # Keep tonal content (melody, chords, bass), drop drums: songs built from
    # the same drum samples otherwise look alike.
    H = median_filter(M, size=(1, 17))
    P = median_filter(M, size=(17, 1))
    M = M * (H ** 2 / (H ** 2 + P ** 2 + 1e-12))
    return LOGM @ M


def peaks(y: np.ndarray, per_sec: int = PEAKS_PER_SEC, bands: np.ndarray | None = None) -> np.ndarray:
    """Spectral peaks of mono audio at FS, as float (frame, logbin) rows, by time."""
    if len(y) < NFFT:
        return np.zeros((0, 2))
    S = np.log((bands if bands is not None else _tonal_bands(y)) + 1e-6)
    S -= np.median(S, axis=1, keepdims=True)  # whiten per band
    local = maximum_filter(S, size=(7, 9)) == S
    cand = np.argwhere(local & (S > 0.5))  # (freq, frame)
    if len(cand) == 0:
        return np.zeros((0, 2))
    vals = S[cand[:, 0], cand[:, 1]]
    frames_per_sec = int(round(1 / FRAME_SEC))
    block = cand[:, 1] // frames_per_sec
    # strongest `per_sec` peaks in every second
    order = np.lexsort((-vals, block))
    cand, block = cand[order], block[order]
    first = np.searchsorted(block, block, side="left")
    rank = np.arange(len(block)) - first
    sel = cand[rank < per_sec]
    out = np.stack([sel[:, 1], sel[:, 0]], axis=1).astype(np.float64)  # (t, f)
    return out[np.argsort(out[:, 0], kind="stable")]


# ------------------------------------------------------- melody (2nd check)
#
# Landmark votes can be fooled by a different song with the same chords and
# instruments. The second check compares the melody line: the strongest
# tonal band above ~320 Hz in each frame, as a quarter-tone index, 255 where
# the frame is too quiet. At the alignment the landmarks found, how often do
# post and song agree within a quarter tone (octave errors forgiven)?

MELODY_LO = 2 * BPO  # two octaves above FMIN
UNVOICED = 255


def melody(bands: np.ndarray) -> np.ndarray:
    band = bands[MELODY_LO:NLOG]
    if band.shape[1] == 0:
        return np.zeros(0, np.uint8)
    idx = np.argmax(band, axis=0) + MELODY_LO
    energy = band.max(axis=0)
    voiced = energy > np.percentile(energy, 40)
    return np.where(voiced, idx, UNVOICED).astype(np.uint8)


def melody_agreement(query: np.ndarray, ref: np.ndarray, speed: float, shift: int, offset: float) -> float | None:
    """Share of voiced frames where post and song name the same pitch class
    (within a quarter tone), at the alignment found; None with too little to compare."""
    t = np.arange(len(query))
    rt = np.round(t * speed + offset).astype(np.int64)
    ok = (query != UNVOICED) & (rt >= 0) & (rt < len(ref))
    q = query[ok].astype(np.int64) - shift
    r = ref[rt[ok]].astype(np.int64)
    both = r != UNVOICED
    q, r = q[both], r[both]
    if len(q) < 20:
        return None
    distance = np.abs(((q - r) + BPO // 2) % BPO - BPO // 2)
    return float(np.mean(distance <= 1))


def pair_hashes(pk: np.ndarray, fanout: int = FANOUT, lookahead: int = LOOKAHEAD) -> tuple[np.ndarray, np.ndarray]:
    """(hash, anchor frame) for landmark pairs; peaks may be fractional (after
    a transform) and are rounded first. Same pairs as the prototype: for each
    anchor, the first `fanout` later peaks within the time and pitch limits.
    Songs always use FANOUT; a post's second, denser pass (`match`) pairs
    more peaks so the song's pairs are still among them."""
    if len(pk) < 2:
        return np.zeros(0, np.int32), np.zeros(0, np.int32)
    t = np.round(pk[:, 0]).astype(np.int64)
    f = np.round(pk[:, 1]).astype(np.int64)
    n = len(t)
    K = min(lookahead, n - 1)
    i = np.arange(n)[None, :]
    k = np.arange(1, K + 1)[:, None]
    j = i + k
    inside = j < n
    jj = np.where(inside, j, 0)
    dt = t[jj] - t[None, :]
    df = f[jj] - f[None, :]
    valid = inside & (dt >= DT_MIN) & (dt <= DT_MAX) & (np.abs(df) <= DF_MAX) & (f[None, :] >= 0) & (f[None, :] < 256)
    valid &= np.cumsum(valid, axis=0) <= fanout
    kk, ii = np.nonzero(valid)
    a = ii
    hashes = (f[a] << 13) | ((df[kk, ii] + 64) << 6) | dt[kk, ii]
    order = np.argsort(a, kind="stable")
    return hashes[order].astype(np.int32), t[a][order].astype(np.int32)


FORMAT_WITH_MELODY = ALGORITHM + "+mel1"
# Current format: the peaks themselves (frame uint16, log bin uint8) and the
# melody line. Pair hashes are derived from the peaks when needed, and the
# large-catalogue shortlist (shortlist.py) needs the peaks. A third the size
# of the hash format.
FORMAT_PEAKS = "bekvor-lp-2"


class Fingerprint:
    """A song's fingerprint. Made from peaks (current format) or, for
    fingerprints stored before 2026-10-11, from pair hashes only."""

    def __init__(self, hashes, times, duration_sec: float, melody: np.ndarray | None = None, peaks: np.ndarray | None = None):
        self._hashes, self._times = hashes, times
        self.duration_sec = duration_sec
        self.melody = melody  # uint8 per frame; None in fingerprints made before the melody check
        self.peaks = peaks  # (frame, logbin) rows by time; None in the older formats
        self.digest: str | None = None  # of the stored bytes, when read from them

    def key(self) -> str:
        """Identifies this fingerprint's content (to see what changed between two catalogues)."""
        if self.digest is None:
            self.digest = hashlib.sha1(self.to_bytes()).hexdigest()
        return self.digest

    @classmethod
    def from_peaks(cls, pk: np.ndarray, duration_sec: float, melody: np.ndarray | None) -> "Fingerprint":
        return cls(None, None, duration_sec, melody, pk)

    def _pairs(self):
        if self._hashes is None:
            self._hashes, self._times = pair_hashes(self.peaks if self.peaks is not None else np.zeros((0, 2)))
        return self._hashes, self._times

    @property
    def hashes(self) -> np.ndarray:
        return self._pairs()[0]

    @property
    def times(self) -> np.ndarray:
        return self._pairs()[1]

    def to_bytes(self) -> bytes:
        mel = self.melody if self.melody is not None else np.zeros(0, np.uint8)
        mel_part = np.array([len(mel)], dtype="<u4").tobytes() + mel.astype(np.uint8).tobytes()
        if self.peaks is not None:
            t = np.clip(np.round(self.peaks[:, 0]), 0, 65535).astype("<u2")
            f = np.clip(np.round(self.peaks[:, 1]), 0, 255).astype(np.uint8)
            header = np.array([len(t)], dtype="<u4").tobytes() + np.array([self.duration_sec], dtype="<f4").tobytes()
            return FORMAT_PEAKS.encode() + b"\n" + zlib.compress(header + t.tobytes() + f.tobytes() + mel_part, 6)
        header = np.array([len(self.hashes)], dtype="<u4").tobytes() + np.array([self.duration_sec], dtype="<f4").tobytes()
        body = self.hashes.astype("<i4").tobytes() + self.times.astype("<i4").tobytes()
        if self.melody is None:
            return ALGORITHM.encode() + b"\n" + zlib.compress(header + body, 6)
        return FORMAT_WITH_MELODY.encode() + b"\n" + zlib.compress(header + body + mel_part, 6)

    @staticmethod
    def from_bytes(data: bytes) -> "Fingerprint":
        fp = Fingerprint._parse(data)
        fp.digest = hashlib.sha1(data).hexdigest()
        return fp

    @staticmethod
    def _parse(data: bytes) -> "Fingerprint":
        name, _, packed = data.partition(b"\n")
        fmt = name.decode()
        if fmt not in (ALGORITHM, FORMAT_WITH_MELODY, FORMAT_PEAKS):
            raise ValueError(f"Fingerprint made with {fmt!r}, this is {FORMAT_PEAKS}.")
        raw = zlib.decompress(packed)
        n = int(np.frombuffer(raw[:4], dtype="<u4")[0])
        duration = float(np.frombuffer(raw[4:8], dtype="<f4")[0])
        if fmt == FORMAT_PEAKS:
            t = np.frombuffer(raw[8:8 + 2 * n], dtype="<u2")
            f = np.frombuffer(raw[8 + 2 * n:8 + 3 * n], dtype=np.uint8)
            at = 8 + 3 * n
            m = int(np.frombuffer(raw[at:at + 4], dtype="<u4")[0])
            mel = np.frombuffer(raw[at + 4:at + 4 + m], dtype=np.uint8).copy()
            pk = np.stack([t, f], axis=1).astype(np.float64)
            return Fingerprint.from_peaks(pk, duration, mel)
        hashes = np.frombuffer(raw[8:8 + 4 * n], dtype="<i4").astype(np.int32)
        times = np.frombuffer(raw[8 + 4 * n:8 + 8 * n], dtype="<i4").astype(np.int32)
        mel = None
        if fmt == FORMAT_WITH_MELODY:
            at = 8 + 8 * n
            m = int(np.frombuffer(raw[at:at + 4], dtype="<u4")[0])
            mel = np.frombuffer(raw[at + 4:at + 4 + m], dtype=np.uint8).copy()
        return Fingerprint(hashes, times, duration, mel)


def fingerprint(y: np.ndarray) -> Fingerprint:
    if len(y) < NFFT:
        return Fingerprint.from_peaks(np.zeros((0, 2)), len(y) / FS, np.zeros(0, np.uint8))
    bands = _tonal_bands(y)
    pk = peaks(y, bands=bands)
    # stored rounded, so the hashes made now and after a reload are the same
    pk = np.stack([np.clip(np.round(pk[:, 0]), 0, 65535), np.clip(np.round(pk[:, 1]), 0, 255)], axis=1)
    return Fingerprint.from_peaks(pk, len(y) / FS, melody(bands))


# ------------------------------------------------------------------ the index

# Songs per shortlist shard (see Index._init_large).
SHARD_SONGS = int(os.environ.get("RECOGNIZER_SHARD_SONGS", "2000"))

# Largest song x offset table counted densely in `Index.score` (8 bytes each).
DENSE_LIMIT = 4_000_000

# Above this many songs, a post is first narrowed to a shortlist (shortlist.py)
# and the precise check runs on the shortlist only.
SHORTLIST_FROM = int(os.environ.get("RECOGNIZER_SHORTLIST_FROM", "200"))
SHORTLIST_SIZE = int(os.environ.get("RECOGNIZER_SHORTLIST_SIZE", "50"))
# ... and how far down it goes when no song stood out among the first.
SHORTLIST_WIDE = int(os.environ.get("RECOGNIZER_SHORTLIST_WIDE", "200"))

# Pair hashes are below 2**21 (frequency bin < 256 in the top bits), so how
# many songs have each hash fits a plain table: 2**21 entries, 8 MB.
HASH_SPACE = 1 << 21


def document_frequency(hash_arrays) -> np.ndarray:
    """For every possible pair hash: in how many of these songs it occurs."""
    df = np.zeros(HASH_SPACE, np.int32)
    for h in hash_arrays:
        if len(h):
            df[np.unique(h)] += 1
    return df


def rarity_weights(df: np.ndarray, n_songs: int) -> np.ndarray:
    """log((n + 1) / songs with the hash), per hash; 0 where no song has it."""
    return np.where(df > 0, np.log((n_songs + 1) / np.maximum(df, 1)), 0).astype(np.float32)


class Index:
    """One workspace's catalogue, ready to search.

    Small catalogues: every song's pair hashes in one table (`large` False).
    Large catalogues: compact peaks per song plus the triplet shortlist index;
    pair hashes are made for the shortlisted songs of each post only, so
    memory stays at a few kilobytes per song instead of ~1 MB.
    """

    def __init__(
        self,
        tracks: list[tuple[str, Fingerprint]],
        shortlist_from: int | None = None,
        weights: np.ndarray | None = None,
        previous: "Index | None" = None,
    ):
        """`weights`: rarity per hash from a larger catalogue (the shortlist
        path passes the whole catalogue's), so a shortlisted subset keeps the
        catalogue's rarities instead of its own. `previous`: this workspace's
        index before the change, whose unchanged shards are reused (large
        catalogues), so a new song doesn't rebuild all 20,000."""
        limit = SHORTLIST_FROM if shortlist_from is None else shortlist_from
        self.ids = [track_id for track_id, _ in tracks]
        self.melodies = [fp.melody for _, fp in tracks]
        self.large = len(tracks) > limit
        if self.large:
            self._init_large(tracks, previous if previous is not None and previous.large else None)
            return
        if not tracks:
            self.H = np.zeros(0, np.int32)
            self.S = self.T = self.W = np.zeros(0)
            self.Hu = np.zeros(0, np.int32)
            self.starts = self.counts = np.zeros(0, np.int64)
            self.max_t = 0
            return
        hashes = [fp.hashes for _, fp in tracks]
        H = np.concatenate(hashes).astype(np.int32)
        T = np.concatenate([fp.times for _, fp in tracks]).astype(np.int32)
        S = np.concatenate([np.full(len(h), sid, np.int32) for sid, h in enumerate(hashes)])
        order = np.argsort(H, kind="stable")  # songs stay in order within a hash
        self.H, self.S, self.T = H[order], S[order], T[order]
        # H is sorted: the distinct hashes start where the value changes
        first = np.flatnonzero(np.r_[True, self.H[1:] != self.H[:-1]])
        self.Hu, self.starts = self.H[first], first.astype(np.int64)
        self.counts = np.diff(np.r_[first, len(self.H)]).astype(np.int64)
        if weights is None:
            weights = rarity_weights(document_frequency(hashes), len(tracks))
        self.W = weights[self.H]
        self.max_t = int(self.T.max()) if len(self.T) else 0

    def _init_large(self, tracks: list[tuple[str, Fingerprint]], previous: "Index | None") -> None:
        from shortlist import ShardedShortlist, ShortlistIndex

        self.durations = [fp.duration_sec for _, fp in tracks]
        self.keys = [(track_id, fp.key()) for track_id, fp in tracks]
        self.peak_t: list[np.ndarray | None] = []
        self.peak_f: list[np.ndarray | None] = []
        # Fingerprints stored before the peak format have no peaks: they can't
        # be shortlisted, so they are always checked (re-uploading fixes that).
        self.legacy: dict[int, Fingerprint] = {}
        with_peaks: list[int] = []
        for i, (_, fp) in enumerate(tracks):
            if fp.peaks is None:
                self.legacy[i] = fp
                self.peak_t.append(None)
                self.peak_f.append(None)
            else:
                self.peak_t.append(fp.peaks[:, 0].astype(np.uint16))
                self.peak_f.append(fp.peaks[:, 1].astype(np.uint8))
                with_peaks.append(i)
        self.with_peaks = np.array(with_peaks, np.int64)

        # Shards by song id (a stable hash), each with its songs in id order:
        # adding or changing a song rebuilds its shard only.
        # a power of two, so the shard count (and with it every song's shard)
        # only changes when the catalogue doubles
        needed = max(1, -(-len(with_peaks) // SHARD_SONGS))
        self.n_shards = 1 << (needed - 1).bit_length()
        groups: dict[int, list[int]] = {}
        for i in with_peaks:
            groups.setdefault(zlib.crc32(self.ids[i].encode()) % self.n_shards, []).append(i)
        self.shard_members: dict[int, tuple] = {}
        reusable = previous.shard_members if previous is not None and previous.n_shards == self.n_shards else {}
        old_shards = dict(zip(previous.shard_ids, previous.shortlist_index.shards)) if reusable else {}
        shards, self.shard_ids, self.rebuilt_shards = [], [], 0
        for g, members in sorted(groups.items()):
            members.sort(key=lambda i: self.ids[i])
            signature = tuple(self.keys[i] for i in members)
            self.shard_members[g] = signature
            positions = np.array(members, np.int64)
            if reusable.get(g) == signature:
                shards.append((positions, old_shards[g][1]))
            else:
                shards.append((positions, ShortlistIndex([self._peaks(i) for i in members])))
                self.rebuilt_shards += 1
            self.shard_ids.append(g)
        self.shortlist_index = ShardedShortlist(shards)

        # The whole catalogue's rarity per pair hash (8 MB), for the precise
        # check on each post's shortlist. Counted again in full, or, given the
        # previous index, updated for the songs that went or came.
        def song_hashes(fp_or_index, i=None):
            if i is not None:  # a song of the previous index
                old = fp_or_index
                return old.legacy[i].hashes if i in old.legacy else pair_hashes(old._peaks(i))[0]
            return pair_hashes(fp_or_index.peaks)[0] if fp_or_index.peaks is not None else fp_or_index.hashes

        if previous is not None:
            before = {key: i for i, key in enumerate(previous.keys)}
            now = set(self.keys)
            self.df = previous.df.copy()
            for key, i in before.items():
                if key not in now:
                    h = np.unique(song_hashes(previous, i))
                    self.df[h] -= 1
            for (key, (_, fp)) in zip(self.keys, tracks):
                if key not in before:
                    self.df[np.unique(song_hashes(fp))] += 1
        else:
            self.df = document_frequency(song_hashes(fp) for _, fp in tracks)
        self.weights = rarity_weights(self.df, len(tracks))

    def _peaks(self, i: int) -> np.ndarray:
        return np.stack([self.peak_t[i], self.peak_f[i]], axis=1).astype(np.float64)

    def candidates(self, pk: np.ndarray, size: int = SHORTLIST_SIZE) -> list[int]:
        found = self.shortlist_index.shortlist(pk, size) if len(self.with_peaks) else []
        return list(dict.fromkeys([int(i) for i in found] + list(self.legacy)))

    def subset(self, positions: list[int]) -> "Index":
        """A small index of these songs (positions in this index), for the precise check."""
        tracks = []
        for i in positions:
            if i in self.legacy:
                tracks.append((self.ids[i], self.legacy[i]))
            else:
                pk = np.stack([self.peak_t[i], self.peak_f[i]], axis=1).astype(np.float64)
                tracks.append((self.ids[i], Fingerprint.from_peaks(pk, self.durations[i], self.melodies[i])))
        return Index(tracks, shortlist_from=len(tracks) + 1, weights=self.weights)

    def nbytes(self) -> int:
        """Memory of the arrays this index holds (for limits and the scale test)."""
        total = sum(v.nbytes for v in vars(self).values() if isinstance(v, np.ndarray))
        total += sum(m.nbytes for m in self.melodies if m is not None)
        if self.large:
            total += sum(a.nbytes for a in self.peak_t + self.peak_f if a is not None)
            total += self.shortlist_index.nbytes()
            total += sum(fp.hashes.nbytes + fp.times.nbytes for fp in self.legacy.values())
        return total

    def score(self, qh: np.ndarray, qt: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Best aligned score per song (rarity-weighted votes for one time
        offset, ±1 frame) and that offset in frames."""
        n = len(self.ids)
        best = np.zeros(n)
        best_off = np.zeros(n, np.int64)
        if n == 0 or len(qh) == 0:
            return best, best_off
        pos = np.searchsorted(self.Hu, qh)
        pos = np.minimum(pos, len(self.Hu) - 1)
        hit = (self.Hu[pos] == qh) & (self.counts[pos] <= MAX_POSTINGS_PER_HASH)
        if not hit.any():
            return best, best_off
        start, cnt, tq = self.starts[pos[hit]], self.counts[pos[hit]], qt[hit].astype(np.int64)
        total = int(cnt.sum())
        base = np.repeat(start, cnt)
        within = np.arange(total) - np.repeat(np.cumsum(cnt) - cnt, cnt)
        idx = base + within
        off = self.T[idx].astype(np.int64) - np.repeat(tq, cnt)
        # Dense counting (one slot per song and offset) when that table is
        # small enough; otherwise sort the keys. Same result, the first is
        # several times faster.
        q_max = int(tq.max()) + 1
        span = self.max_t + q_max + 2
        if n * span <= DENSE_LIMIT:
            key = self.S[idx].astype(np.int64) * span + (off + q_max)
            sums = np.bincount(key, weights=self.W[idx], minlength=n * span).reshape(n, span)
            smoothed = sums.copy()
            smoothed[:, 1:] += sums[:, :-1]
            smoothed[:, :-1] += sums[:, 1:]
            at = np.argmax(smoothed, axis=1)
            best = smoothed[np.arange(n), at]
            best_off = at - q_max
            return best, best_off
        OFF = 1 << 22
        key = self.S[idx] * (2 * OFF) + (off + OFF)
        uk, inv = np.unique(key, return_inverse=True)
        sums = np.bincount(inv, weights=self.W[idx])
        smoothed = sums.copy()
        for d in (-1, 1):
            p = np.searchsorted(uk, uk + d)
            ok = (p < len(uk)) & (uk[np.minimum(p, len(uk) - 1)] == uk + d)
            smoothed[ok] += sums[p[ok]]
        sid = uk // (2 * OFF)
        offset = uk % (2 * OFF) - OFF
        sid = sid.astype(np.int64)
        # per song: the best offset (uk is sorted, so songs are contiguous)
        order = np.lexsort((-smoothed, sid))
        first = order[np.r_[True, sid[order][1:] != sid[order][:-1]]]
        best[sid[first]] = smoothed[first]
        best_off[sid[first]] = offset[first]
        return best, best_off


def _transforms(robust: bool = True) -> list[tuple[float, int]]:
    combos = [(1.0, 0)]
    if robust:
        for s in np.exp(np.linspace(np.log(0.78), np.log(1.32), 29)):
            combos.append((float(s), 0))  # time-stretch, pitch kept
            # sped up/slowed: pitch follows, by a fraction of a log bin; peaks
            # round either way, so both neighbouring shifts are tried (slowed
            # posts: right song on top 27 -> 29 of 30, decided 13 -> 18)
            shift = BPO * np.log2(s)
            combos.append((float(s), int(np.floor(shift))))
            combos.append((float(s), int(np.ceil(shift))))
        for k in range(-8, 9):
            combos.append((1.0, k))  # pitch alone, up to ±4 semitones
    seen, out = set(), []
    for s, k in combos:
        key = (round(s, 4), k)
        if key not in seen:
            seen.add(key)
            out.append((s, k))
    return out


TRANSFORMS = _transforms()


def _query_peaks(index: Index, pk: np.ndarray, transforms, density: int = 1) -> tuple[np.ndarray, np.ndarray, list]:
    """Best score per song over the transforms, and the transform per song."""
    n = len(index.ids)
    best = np.zeros(n)
    best_tf: list = [None] * n
    for s, k in transforms:
        p = pk.copy()
        p[:, 0] *= s  # query frame -> reference frame
        p[:, 1] -= k
        h, t = pair_hashes(p, FANOUT * density, LOOKAHEAD * density)
        sc, off = index.score(h, t)
        better = sc > best
        for i in np.nonzero(better)[0]:
            best_tf[i] = (s, k, int(off[i]))
        best = np.maximum(best, sc)
    return best, len(pk), best_tf


DENSE_FACTOR = 2  # the second pass: twice the peaks per second, twice the pairs per peak
# More pairs mean more chance votes too: songs that aren't in the post scored
# about 1.6x as much in the dense pass (four real recordings, 2026-10-12).
# Its scores are divided by this, so the app's minimum score keeps meaning
# the same; ratios between songs don't change.
DENSE_SCORE_SCALE = 1.6


def match(index: Index, y: np.ndarray, top: int = 3) -> dict:
    """Which catalogue songs the audio contains, best first, with the
    evidence a decision needs: score, the next song's score, how many
    windows of the post each song wins, and the speed/pitch it was found at.

    Large catalogues: the precise check runs on the shortlist's best
    `SHORTLIST_SIZE` songs; when no song stands out clearly there, on the next
    ones up to `SHORTLIST_WIDE` too. Hard posts (music quiet under speech,
    several edits at once) often have the right song just below the first
    cut, while clear posts are settled in the first round.

    When no song is clearly ahead in at least half the post, a second pass
    reads the post with twice the peaks (`DENSE_FACTOR`): under a voice-over
    the voice takes many of the strongest peaks, and the song's own peaks are
    often the next ones down. The pass with the clearer leader is kept. Clear
    posts never pay for it."""
    duration = len(y) / FS
    bands = _tonal_bands(y) if len(y) >= NFFT else None
    pk = peaks(y, bands=bands) if bands is not None else np.zeros((0, 2))
    query_melody = melody(bands) if bands is not None else np.zeros(0, np.uint8)
    result = {"algorithm": ALGORITHM, "durationSec": round(duration, 2), "peaks": int(len(pk)), "windows": 0, "candidates": []}
    if len(index.ids) == 0 or len(pk) < 10:
        return result
    first = _match_peaks(index, pk, query_melody, top, {**result, "candidates": []}, 1)
    if _decisive(first):
        return first
    dense = peaks(y, per_sec=PEAKS_PER_SEC * DENSE_FACTOR, bands=bands)
    second = _match_peaks(index, dense, query_melody, top, {**result, "peaks": int(len(dense)), "candidates": []}, DENSE_FACTOR)
    if _lead(second) > _lead(first):
        for c in second["candidates"]:
            c["score"] = round(c["score"] / DENSE_SCORE_SCALE, 2)
            c["nextScore"] = round(c["nextScore"] / DENSE_SCORE_SCALE, 2)
        second["densePass"] = True
        return second
    return first


def _lead(result: dict) -> float:
    """How far the best song is ahead, as the app's decision rule reads it."""
    c = result["candidates"]
    return c[0]["score"] / max(c[0]["nextScore"], 20.0) if c else 0.0


def _decisive(result: dict) -> bool:
    c = result["candidates"]
    return bool(c) and _lead(result) >= 3.0 and c[0]["windowsWon"] * 2 >= result["windows"] > 0


def _match_peaks(index: Index, pk: np.ndarray, query_melody: np.ndarray, top: int, result: dict, density: int) -> dict:
    if not index.large:
        return _evaluate([_scored(index, pk, density)], pk, query_melody, top, result, density)

    ranked = index.candidates(pk, SHORTLIST_WIDE)  # shortlist order, then songs that can't be shortlisted
    legacy = [i for i in ranked if i in index.legacy]
    found = [i for i in ranked if i not in index.legacy]
    first, rest = found[:SHORTLIST_SIZE] + legacy, found[SHORTLIST_SIZE:]
    if not first:
        return result
    parts = [_scored(index.subset(first), pk, density)]
    if rest and not _stands_out(parts[0][1]):
        parts.append(_scored(index.subset(rest), pk, density))
    result["shortlisted"] = sum(len(part.ids) for part, _, _ in parts)
    return _evaluate(parts, pk, query_melody, top, result, density)


def _scored(part: Index, pk: np.ndarray, density: int = 1):
    whole, _, tf = _query_peaks(part, pk, TRANSFORMS, density)
    return part, whole, tf


def _stands_out(whole: np.ndarray, ratio: float = 3.0, floor: float = 20.0) -> bool:
    """The best song is clearly ahead (as the app's decision rule reads it)."""
    if len(whole) < 2:
        return len(whole) == 1 and whole[0] > floor
    first, second = np.sort(whole)[-2:][::-1]
    return first / max(second, floor) >= ratio


def _evaluate(parts, pk: np.ndarray, query_melody: np.ndarray, top: int, result: dict, density: int = 1) -> dict:
    """The candidates from one or more scored parts of the catalogue (songs
    are scored independently, with the catalogue's weights, so parts can be
    put side by side)."""
    ids = [track_id for part, _, _ in parts for track_id in part.ids]
    melodies = [m for part, _, _ in parts for m in part.melodies]
    whole = np.concatenate([w for _, w, _ in parts])
    tf = [t for _, _, tfs in parts for t in tfs]
    ranked = np.argsort(-whole)[: max(top, 2)]
    second_overall = float(whole[ranked[1]]) if len(ranked) > 1 else 0.0

    # windows: in how many parts of the post does each candidate win?
    frames_per_sec = 1 / FRAME_SEC
    win, hop = int(WINDOW_SEC * frames_per_sec), int(WINDOW_HOP_SEC * frames_per_sec)
    last = pk[-1, 0]
    starts = [0] if last <= win else list(range(0, int(last - win) + hop, hop))
    candidate_tfs = {tf[i][:2] for i in ranked if tf[i] is not None}
    wins = np.zeros(len(ids), np.int64)
    for a in starts:
        sel = pk[(pk[:, 0] >= a) & (pk[:, 0] < a + win)].copy()
        if len(sel) < 10:
            continue
        sel[:, 0] -= a
        sc = np.concatenate([_query_peaks(part, sel, candidate_tfs, density)[0] for part, _, _ in parts])
        if sc.max() > 0:
            wins[int(np.argmax(sc))] += 1
    result["windows"] = len(starts)

    for rank, i in enumerate(ranked[:top]):
        if whole[i] <= 0:
            continue
        s, k, off = tf[i] if tf[i] else (1.0, 0, 0)
        # for the top song: the best other song; for the others: the top song
        other = second_overall if rank == 0 else float(whole[ranked[0]])
        result["candidates"].append({
            "trackId": ids[i],
            "score": round(float(whole[i]), 2),
            "nextScore": round(other, 2),
            "windowsWon": int(wins[i]),
            "speed": round(s, 3),
            "pitchSemitones": round(k / 2, 1),
            "songOffsetSec": round(off * FRAME_SEC, 2),
            # 2nd check: do the melody lines agree at this alignment? None when the
            # song's fingerprint predates the melody check, or too little to compare.
            "melodyAgreement": (
                None if melodies[i] is None
                else _round(melody_agreement(query_melody, melodies[i], s, k, off))
            ),
        })
    return result


def _round(value: float | None) -> float | None:
    return None if value is None else round(value, 3)
