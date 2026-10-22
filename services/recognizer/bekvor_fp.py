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

def _log_matrix(delta: float = 0.0) -> np.ndarray:
    """Linear FFT bins -> log bins (BPO per octave from FMIN), the bin centres
    moved up by `delta` of a bin (0 for fingerprints)."""
    freqs = np.fft.rfftfreq(NFFT, 1 / FS)
    centers = FMIN * 2 ** ((np.arange(NLOG) + delta) / BPO)
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

# A sped-up or slowed post (pitch follows the speed) sits a fraction of a log
# bin away from the song's grid: 1.2x is 6.3 bins up. Its peaks then round
# differently from the song's, and about half of the frequency steps between
# peaks come out one bin off. Reading the post on grids moved by a third and
# two thirds of a bin puts it within a sixth of a bin of the song's grid
# whatever the speed (`GRID_THIRDS`). Fingerprints stay on the plain grid.
GRID_THIRDS = 3
LOGM_THIRDS = [LOGM] + [_log_matrix(t / GRID_THIRDS) for t in range(1, GRID_THIRDS)]


def _tonal_spectrum(y: np.ndarray) -> np.ndarray:
    """Magnitude spectrogram (linear bins x frames) of the tonal part of the audio."""
    _, _, Z = stft(y.astype(np.float64), fs=FS, nperseg=NFFT, noverlap=NFFT - HOP, boundary=None, padded=False)
    M = np.abs(Z)
    # Keep tonal content (melody, chords, bass), drop drums: songs built from
    # the same drum samples otherwise look alike.
    H = median_filter(M, size=(1, 17))
    P = median_filter(M, size=(17, 1))
    return M * (H ** 2 / (H ** 2 + P ** 2 + 1e-12))


def _tonal_bands(y: np.ndarray) -> np.ndarray:
    """Log-frequency band energies (NLOG x frames) of the tonal part of the audio."""
    return LOGM @ _tonal_spectrum(y)


def post_peaks(spectrum: np.ndarray, per_sec: int = PEAKS_PER_SEC, bands: np.ndarray | None = None) -> dict[int, np.ndarray]:
    """A post's peaks on each grid (third of a bin -> peaks); `bands`: the plain grid's, if already made."""
    out = {0: _peaks_from_bands(bands if bands is not None else LOGM @ spectrum, per_sec)}
    for t in range(1, GRID_THIRDS):
        out[t] = _peaks_from_bands(LOGM_THIRDS[t] @ spectrum, per_sec)
    return out


def _aligned(post, s: float, k: int) -> tuple[np.ndarray, int, int]:
    """The post's peaks to use for transform (speed s, shift k), the shift on
    that grid, and the shift to report (whole bins on the plain grid, for the
    pitch shown and the melody check). A pitch that follows the speed (k near
    BPO*log2(s)) is read on the grid nearest to its fractional part, where
    the floor and ceiling transforms become one; tempo-only and pitch-only
    transforms (whole bins) on the plain grid. Plain arrays are used as they are."""
    if not isinstance(post, dict):
        return post, k, k
    if s == 1.0 or k == 0:
        return post[0], k, k
    shift = BPO * np.log2(s)
    whole = int(np.floor(shift))
    third = int(round((shift - whole) * GRID_THIRDS))
    if third == GRID_THIRDS:
        whole, third = whole + 1, 0
    return post[third], whole, int(round(shift))


def peaks(y: np.ndarray, per_sec: int = PEAKS_PER_SEC, bands: np.ndarray | None = None) -> np.ndarray:
    """Spectral peaks of mono audio at FS, as float (frame, logbin) rows, by time."""
    if bands is None:
        if len(y) < NFFT:
            return np.zeros((0, 2))
        bands = _tonal_bands(y)
    return _peaks_from_bands(bands, per_sec)


def _peaks_from_bands(bands: np.ndarray, per_sec: int) -> np.ndarray:
    if bands.shape[1] == 0:
        return np.zeros((0, 2))
    S = np.log(bands + 1e-6)
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


try:  # compiled when numba is installed (the Docker image has it); same results, several times faster
    from numba import njit as _njit
except ImportError:  # pragma: no cover - plain numpy below
    _njit = None


def _pair_hashes_loop(t, f, fanout, lookahead, dt_min, dt_max, df_max):
    """The pairs `_pair_hashes_numpy` makes, in the same order (anchor, then
    distance), without its (lookahead x peaks) temporary arrays and sort."""
    n = len(t)
    hashes = np.empty(n * fanout, np.int64)
    times = np.empty(n * fanout, np.int64)
    m = 0
    for a in range(n):
        fa = f[a]
        if fa < 0 or fa >= 256:
            continue
        got = 0
        for k in range(1, lookahead + 1):
            j = a + k
            if j >= n:
                break
            dt = t[j] - t[a]
            df = f[j] - fa
            if dt >= dt_min and dt <= dt_max and abs(df) <= df_max:
                hashes[m] = (fa << 13) | ((df + 64) << 6) | dt
                times[m] = t[a]
                m += 1
                got += 1
                if got >= fanout:
                    break
    return hashes[:m], times[:m]


_pair_hashes_fast = _njit(cache=True, nogil=True)(_pair_hashes_loop) if _njit else None


def pair_hashes(pk: np.ndarray, fanout: int = FANOUT, lookahead: int = LOOKAHEAD) -> tuple[np.ndarray, np.ndarray]:
    """(hash, anchor frame) for landmark pairs; peaks may be fractional (after
    a transform) and are rounded first. Same pairs as the prototype: for each
    anchor, the first `fanout` later peaks within the time and pitch limits.
    Songs always use FANOUT; a post's second, denser pass (`match`) pairs
    more peaks so the song's pairs are still among them."""
    if len(pk) < 2:
        return np.zeros(0, np.int32), np.zeros(0, np.int32)
    if _pair_hashes_fast is not None:
        t = np.round(pk[:, 0]).astype(np.int64)
        f = np.round(pk[:, 1]).astype(np.int64)
        h, tt = _pair_hashes_fast(t, f, fanout, min(lookahead, len(t) - 1), DT_MIN, DT_MAX, DF_MAX)
        return h.astype(np.int32), tt.astype(np.int32)
    return _pair_hashes_numpy(pk, fanout, lookahead)


def _pair_hashes_numpy(pk: np.ndarray, fanout: int = FANOUT, lookahead: int = LOOKAHEAD) -> tuple[np.ndarray, np.ndarray]:
    """The plain numpy version of `pair_hashes` (no numba)."""
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
        self._by_hash: tuple[np.ndarray, np.ndarray] | None = None

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

    def pairs_by_hash(self) -> tuple[np.ndarray, np.ndarray]:
        """(hash, time) as int32, ordered by hash (stable: equal hashes keep
        their time order). An index built from songs in this order sorts
        sorted runs, about four times faster than shuffled pairs, with the
        same result."""
        if self._by_hash is None:
            h, t = self._pairs()
            order = np.argsort(h, kind="stable")
            self._by_hash = (h[order].astype(np.int32), t[order].astype(np.int32))
        return self._by_hash

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
# ... and how far down it goes when no song stood out among the first (and
# again with twice the peaks). Each song is checked only near the speed the
# shortlist found for it, which is what makes 400 affordable.
SHORTLIST_WIDE = int(os.environ.get("RECOGNIZER_SHORTLIST_WIDE", "400"))
# How far from the shortlist's speed estimate (natural log of the speed
# ratio) the precise check still tries: the estimate's own bin is 3 % wide
# and can be one bin off, so about ±4.5 %.
SPEED_WINDOW = 0.045
# Which deeper passes look the post up on all three grids (`GRID_THIRDS`):
# "dense" (default) or "both" (also the wide pass: a few more hard posts
# found, about twice the shortlist time at 20,000 songs).
SHORTLIST_GRIDS = os.environ.get("RECOGNIZER_SHORTLIST_GRIDS", "dense")

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
        pairs = [fp.pairs_by_hash() for _, fp in tracks]
        hashes = [h for h, _ in pairs]
        H = np.concatenate(hashes)
        T = np.concatenate([t for _, t in pairs])
        S = np.concatenate([np.full(len(h), sid, np.int32) for sid, h in enumerate(hashes)])
        order = np.argsort(H, kind="stable")  # songs stay in order within a hash (and times within a song)
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

    def candidates_with_speed(self, pk, size: int = SHORTLIST_SIZE) -> list[tuple[int, int | None]]:
        """(position, speed bin) of the shortlisted songs, best first, then the
        songs that can't be shortlisted (no peaks stored) with None: they are
        checked at every speed. `pk`: the post's peaks, or a list of peak sets
        (the post on several grids): each song keeps its best lookup."""
        out = []
        if len(self.with_peaks):
            best: dict[int, tuple[float, int]] = {}
            for points in (pk if isinstance(pk, list) else [pk]):
                found, bins, scores = self.shortlist_index.shortlist_scored(points, size)
                for i, b, sc in zip(found, bins, scores):
                    if int(i) not in best or sc > best[int(i)][0]:
                        best[int(i)] = (float(sc), int(b))
            ranked = sorted(best.items(), key=lambda kv: -kv[1][0])[:size]
            out = [(i, b) for i, (_, b) in ranked]
        return out + [(i, None) for i in self.legacy]

    def subset(self, positions: list[int], cache: dict | None = None) -> "Index":
        """A small index of these songs (positions in this index), for the
        precise check. `cache` (position -> Fingerprint) keeps each song's
        pair hashes for the other subsets of the same post."""
        tracks = []
        for i in positions:
            if i in self.legacy:
                tracks.append((self.ids[i], self.legacy[i]))
                continue
            f = cache.get(i) if cache is not None else None
            if f is None:
                pk = np.stack([self.peak_t[i], self.peak_f[i]], axis=1).astype(np.float64)
                f = Fingerprint.from_peaks(pk, self.durations[i], self.melodies[i])
                if cache is not None:
                    cache[i] = f
            tracks.append((self.ids[i], f))
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
        q_max = int(tq.max()) + 1
        span = self.max_t + q_max + 2
        dense = n * span <= DENSE_LIMIT
        if not (dense and _dense_votes_fast is not None):
            total = int(cnt.sum())
            base = np.repeat(start, cnt)
            within = np.arange(total) - np.repeat(np.cumsum(cnt) - cnt, cnt)
            idx = base + within
            off = self.T[idx].astype(np.int64) - np.repeat(tq, cnt)
        # Dense counting (one slot per song and offset) when that table is
        # small enough; otherwise sort the keys. Same result, the first is
        # several times faster.
        if dense:
            if _dense_votes_fast is not None:
                # the same sums, added in the same order, without the per-vote arrays,
                # and the same smoothing and best offset, without copying the table
                sums = _dense_votes_fast(start, cnt.astype(np.int64), tq, self.T, self.S, self.W, n, span, q_max)
                best, at = _best_offsets_fast(sums, n, span)
                return best, at - q_max
            else:
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


def _dense_votes_loop(start, cnt, tq, T, S, W, n, span, q_max):
    """`Index.score`'s dense vote table: per (song, offset), the summed weights
    of the matching pairs, added in the order np.bincount would add them."""
    sums = np.zeros(n * span)
    for h in range(len(start)):
        q = tq[h]
        for p in range(start[h], start[h] + cnt[h]):
            sums[np.int64(S[p]) * span + (np.int64(T[p]) - q + q_max)] += W[p]
    return sums


_dense_votes_fast = _njit(cache=True, nogil=True)(_dense_votes_loop) if _njit else None


def _best_offsets_loop(sums, n, span):
    """Per song (a row of `span` offsets): the best offset after adding each
    offset's neighbours, as `Index.score` does it with numpy (same additions
    in the same order, the first offset on a tie)."""
    best = np.zeros(n)
    at = np.zeros(n, np.int64)
    for s in range(n):
        row = s * span
        top = -1.0
        where = 0
        for i in range(span):
            v = sums[row + i]
            if i > 0:
                v += sums[row + i - 1]
            if i < span - 1:
                v += sums[row + i + 1]
            if v > top:
                top = v
                where = i
        best[s] = top
        at[s] = where
    return best, at


_best_offsets_fast = _njit(cache=True, nogil=True)(_best_offsets_loop) if _njit else None


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


def _query_peaks(index: Index, pk, transforms, density: int = 1) -> tuple[np.ndarray, np.ndarray, list]:
    """Best score per song over the transforms, and the transform per song.
    `pk`: the post's peaks, or its peaks per grid (`post_peaks`)."""
    n = len(index.ids)
    best = np.zeros(n)
    best_tf: list = [None] * n
    done = set()
    for s, k in transforms:
        grid_pk, kk, k_report = _aligned(pk, s, k)
        if (s, id(grid_pk), kk) in done:  # floor and ceil of a shift land on one grid
            continue
        done.add((s, id(grid_pk), kk))
        p = grid_pk.copy()
        p[:, 0] *= s  # query frame -> reference frame
        p[:, 1] -= kk
        h, t = pair_hashes(p, FANOUT * density, LOOKAHEAD * density)
        sc, off = index.score(h, t)
        better = sc > best
        for i in np.nonzero(better)[0]:
            best_tf[i] = (s, k_report, int(off[i]))
        best = np.maximum(best, sc)
    return best, len(pk), best_tf


DENSE_FACTOR = 2  # the second pass: twice the peaks per second, twice the pairs per peak
# More pairs mean more chance votes too: songs that aren't in the post scored
# about 1.6x as much in the dense pass (four real recordings, 2026-10-12).
# Its scores are divided by this, so the app's minimum score keeps meaning
# the same; ratios between songs don't change.
DENSE_SCORE_SCALE = 1.6
# Off ("0") skips the second pass: faster in very large catalogues, fewer hard
# posts found (services/recognizer/README.md has the numbers).
DENSE_PASS = os.environ.get("RECOGNIZER_DENSE_PASS", "1") != "0"


def match(index: Index, y: np.ndarray, top: int = 3) -> dict:
    """Which catalogue songs the audio contains, best first, with the
    evidence a decision needs: score, the next song's score, how many
    windows of the post each song wins, and the speed/pitch it was found at.

    Small catalogues: every song at every speed and pitch (`TRANSFORMS`).
    Large catalogues: see `_match_large`.

    When no song is clearly ahead in at least half the post, a second pass
    reads the post with twice the peaks (`DENSE_FACTOR`): under a voice-over
    the voice takes many of the strongest peaks, and the song's own peaks are
    often the next ones down. The pass with the clearer leader is kept. Clear
    posts never pay for it."""
    duration = len(y) / FS
    spectrum = _tonal_spectrum(y) if len(y) >= NFFT else None
    bands = LOGM @ spectrum if spectrum is not None else None
    pk = peaks(y, bands=bands) if bands is not None else np.zeros((0, 2))
    query_melody = melody(bands) if bands is not None else np.zeros(0, np.uint8)
    result = {"algorithm": ALGORITHM, "durationSec": round(duration, 2), "peaks": int(len(pk)), "windows": 0, "candidates": []}
    if len(index.ids) == 0 or len(pk) < 10:
        return result
    post = post_peaks(spectrum, bands=bands)
    if index.large:
        return _match_large(index, spectrum, post, query_melody, top, result)
    first = _match_peaks(index, post, query_melody, top, {**result, "candidates": []}, 1)
    if _decisive(first) or not DENSE_PASS:
        return first
    dense = post_peaks(spectrum, PEAKS_PER_SEC * DENSE_FACTOR)
    second = _match_peaks(index, dense, query_melody, top, {**result, "peaks": int(len(dense[0])), "candidates": []}, DENSE_FACTOR)
    return _dense_if_clearer(first, second)


def _match_large(index: Index, spectrum: np.ndarray, post: dict, query_melody: np.ndarray, top: int, result: dict) -> dict:
    """Large catalogues: the shortlist (shortlist.py) names the likely songs
    and, for each, the speed at which it matched; the precise check then
    tries only the transforms near that speed for that song (`_guided_parts`).

    1. The shortlist's best `SHORTLIST_SIZE` songs. Clear posts end here.
    2. Otherwise its best `SHORTLIST_WIDE` (400): hard posts (music quiet
       under speech, several edits at once) often have the right song far down.
    3. And the shortlist of the post read with twice the peaks, on all three
       grids (`GRID_THIRDS`), also 400 deep: under a voice-over that one often
       has the right song near the top when the normal one doesn't have it at
       all. `SHORTLIST_GRIDS` "both" reads pass 2 on all three grids as well.
    The pass with the clearer leader is kept. Songs checked in an earlier
    pass keep their pair hashes (`cache`)."""
    cache: dict = {}

    def check(points: dict, size: int, density: int, grids: bool, base: dict) -> dict:
        parts = _guided_parts(index, points, size, density, cache, grids)
        return _evaluate(parts, points, query_melody, top, {**base, "candidates": []}, density)

    def done(out: dict) -> dict:
        out["shortlisted"] = len(cache) + len(index.legacy)  # songs checked, all passes
        return out

    first = check(post, SHORTLIST_SIZE, 1, False, result)
    if _decisive(first):
        return done(first)
    wide = check(post, SHORTLIST_WIDE, 1, SHORTLIST_GRIDS == "both", result)
    best = wide if _lead(wide) >= _lead(first) else first
    if not DENSE_PASS:
        return done(best)
    dense = post_peaks(spectrum, PEAKS_PER_SEC * DENSE_FACTOR)
    return done(_dense_if_clearer(best, check(dense, SHORTLIST_WIDE, DENSE_FACTOR, True, {**result, "peaks": int(len(dense[0]))})))


def _dense_if_clearer(first: dict, second: dict) -> dict:
    """The dense pass's result when its leader is clearer, its scores scaled
    back to the normal pass's (`DENSE_SCORE_SCALE`); else the first."""
    if _lead(second) > _lead(first):
        for c in second["candidates"]:
            c["score"] = round(c["score"] / DENSE_SCORE_SCALE, 2)
            c["nextScore"] = round(c["nextScore"] / DENSE_SCORE_SCALE, 2)
        second["densePass"] = True
        return second
    return first


def _transforms_near(sbin: int | None) -> list[tuple[float, int]]:
    """The transforms (`TRANSFORMS`, the same grid as small catalogues use:
    being one grid step off the real speed halves the score) within
    `SPEED_WINDOW` of a speed bin's speed. Pitch-only transforms belong to
    speed 1. No bin (a song without peaks): all of them."""
    if sbin is None:
        return TRANSFORMS
    from shortlist import SPEED_BIN_ZERO, speed_of_bin

    s0 = speed_of_bin(sbin)
    out = [(s, k) for s, k in TRANSFORMS if abs(np.log(s / s0)) <= SPEED_WINDOW]
    if abs(sbin - SPEED_BIN_ZERO) > 1:
        out = [(s, k) for s, k in out if s != 1.0 or k == 0]
    return out or [(1.0, 0)]


def _guided_parts(index: Index, post: dict, size: int, density: int, cache: dict, grids: bool = False):
    """The shortlist's `size` best songs (looked up with the plain grid's
    peaks, or with every grid's, `grids`), scored in groups of the same speed
    bin, each group at the transforms near its speed: (part, scores, transforms) per group."""
    groups: dict = {}
    lookups = [post[t] for t in sorted(post)] if grids else [post[0]]
    for i, sbin in index.candidates_with_speed(lookups, size):
        groups.setdefault(sbin, []).append(i)
    parts = []
    for sbin, members in groups.items():
        part = index.subset(members, cache)
        whole, _, tf = _query_peaks(part, post, _transforms_near(sbin), density)
        parts.append((part, whole, tf))
    return parts


def _lead(result: dict) -> float:
    """How far the best song is ahead, as the app's decision rule reads it."""
    c = result["candidates"]
    return c[0]["score"] / max(c[0]["nextScore"], 20.0) if c else 0.0


def _decisive(result: dict) -> bool:
    c = result["candidates"]
    return bool(c) and _lead(result) >= 3.0 and c[0]["windowsWon"] * 2 >= result["windows"] > 0


def _match_peaks(index: Index, pk, query_melody: np.ndarray, top: int, result: dict, density: int) -> dict:
    """One pass over a small catalogue: every song at every transform."""
    whole, _, tf = _query_peaks(index, pk, TRANSFORMS, density)
    return _evaluate([(index, whole, tf)], pk, query_melody, top, result, density)


def _evaluate(parts, pk, query_melody: np.ndarray, top: int, result: dict, density: int = 1) -> dict:
    """The candidates from one or more scored parts of the catalogue (songs
    are scored independently, with the catalogue's weights, so parts can be
    put side by side)."""
    if not parts:
        return result
    ids = [track_id for part, _, _ in parts for track_id in part.ids]
    melodies = [m for part, _, _ in parts for m in part.melodies]
    whole = np.concatenate([w for _, w, _ in parts])
    tf = [t for _, _, tfs in parts for t in tfs]
    ranked = np.argsort(-whole)[: max(top, 2)]
    second_overall = float(whole[ranked[1]]) if len(ranked) > 1 else 0.0

    # windows: in how many parts of the post does each candidate win?
    frames_per_sec = 1 / FRAME_SEC
    win, hop = int(WINDOW_SEC * frames_per_sec), int(WINDOW_HOP_SEC * frames_per_sec)
    grids = pk if isinstance(pk, dict) else {0: pk}
    last = grids[0][-1, 0]
    starts = [0] if last <= win else list(range(0, int(last - win) + hop, hop))
    candidate_tfs = {tf[i][:2] for i in ranked if tf[i] is not None}
    wins = np.zeros(len(ids), np.int64)
    for a in starts:
        sel = {}
        for g, p in grids.items():
            part_pk = p[(p[:, 0] >= a) & (p[:, 0] < a + win)].copy()
            part_pk[:, 0] -= a
            sel[g] = part_pk
        if len(sel[0]) < 10:
            continue
        sel = sel if isinstance(pk, dict) else sel[0]
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
