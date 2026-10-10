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

import os
import subprocess
import tempfile
import zlib
from dataclasses import dataclass

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


def pair_hashes(pk: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(hash, anchor frame) for landmark pairs; peaks may be fractional (after
    a transform) and are rounded first. Same pairs as the prototype: for each
    anchor, the first FANOUT later peaks within the time and pitch limits."""
    if len(pk) < 2:
        return np.zeros(0, np.int32), np.zeros(0, np.int32)
    t = np.round(pk[:, 0]).astype(np.int64)
    f = np.round(pk[:, 1]).astype(np.int64)
    n = len(t)
    K = min(LOOKAHEAD, n - 1)
    i = np.arange(n)[None, :]
    k = np.arange(1, K + 1)[:, None]
    j = i + k
    inside = j < n
    jj = np.where(inside, j, 0)
    dt = t[jj] - t[None, :]
    df = f[jj] - f[None, :]
    valid = inside & (dt >= DT_MIN) & (dt <= DT_MAX) & (np.abs(df) <= DF_MAX) & (f[None, :] >= 0) & (f[None, :] < 256)
    valid &= np.cumsum(valid, axis=0) <= FANOUT
    kk, ii = np.nonzero(valid)
    a = ii
    hashes = (f[a] << 13) | ((df[kk, ii] + 64) << 6) | dt[kk, ii]
    order = np.argsort(a, kind="stable")
    return hashes[order].astype(np.int32), t[a][order].astype(np.int32)


FORMAT_WITH_MELODY = ALGORITHM + "+mel1"


@dataclass
class Fingerprint:
    hashes: np.ndarray  # int32
    times: np.ndarray  # int32, frames
    duration_sec: float
    melody: np.ndarray | None = None  # uint8 per frame; None in fingerprints made before the melody check

    def to_bytes(self) -> bytes:
        header = np.array([len(self.hashes)], dtype="<u4").tobytes() + np.array([self.duration_sec], dtype="<f4").tobytes()
        body = self.hashes.astype("<i4").tobytes() + self.times.astype("<i4").tobytes()
        if self.melody is None:
            return ALGORITHM.encode() + b"\n" + zlib.compress(header + body, 6)
        mel = np.array([len(self.melody)], dtype="<u4").tobytes() + self.melody.astype(np.uint8).tobytes()
        return FORMAT_WITH_MELODY.encode() + b"\n" + zlib.compress(header + body + mel, 6)

    @staticmethod
    def from_bytes(data: bytes) -> "Fingerprint":
        name, _, packed = data.partition(b"\n")
        fmt = name.decode()
        if fmt not in (ALGORITHM, FORMAT_WITH_MELODY):
            raise ValueError(f"Fingerprint made with {fmt!r}, this is {ALGORITHM}.")
        raw = zlib.decompress(packed)
        n = int(np.frombuffer(raw[:4], dtype="<u4")[0])
        duration = float(np.frombuffer(raw[4:8], dtype="<f4")[0])
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
        return Fingerprint(np.zeros(0, np.int32), np.zeros(0, np.int32), len(y) / FS, np.zeros(0, np.uint8))
    bands = _tonal_bands(y)
    h, t = pair_hashes(peaks(y, bands=bands))
    return Fingerprint(h, t, len(y) / FS, melody(bands))


# ------------------------------------------------------------------ the index

class Index:
    """One workspace's catalogue, ready to search."""

    def __init__(self, tracks: list[tuple[str, Fingerprint]]):
        self.ids = [track_id for track_id, _ in tracks]
        self.melodies = [fp.melody for _, fp in tracks]
        if not tracks:
            self.H = np.zeros(0, np.int32)
            self.S = self.T = self.W = np.zeros(0)
            self.Hu = np.zeros(0, np.int32)
            self.starts = self.counts = np.zeros(0, np.int64)
            return
        H = np.concatenate([fp.hashes for _, fp in tracks]).astype(np.int64)
        T = np.concatenate([fp.times for _, fp in tracks]).astype(np.int64)
        S = np.concatenate([np.full(len(fp.hashes), sid, np.int64) for sid, (_, fp) in enumerate(tracks)])
        order = np.lexsort((S, H))
        self.H, self.S, self.T = H[order], S[order], T[order]
        self.Hu, self.starts, self.counts = np.unique(self.H, return_index=True, return_counts=True)
        # rarity weight: log((n + 1) / number of songs that have the hash)
        pair = np.unique(self.H * len(tracks) + self.S)
        songs_per_hash = np.bincount(np.searchsorted(self.Hu, pair // len(tracks)), minlength=len(self.Hu))
        weight_u = np.log((len(tracks) + 1) / songs_per_hash)
        self.W = np.repeat(weight_u, self.counts)

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
        off = self.T[idx] - np.repeat(tq, cnt)
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
            combos.append((float(s), int(round(BPO * np.log2(s)))))  # sped up/slowed: pitch follows
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


def _query_peaks(index: Index, pk: np.ndarray, transforms) -> tuple[np.ndarray, np.ndarray, list]:
    """Best score per song over the transforms, and the transform per song."""
    n = len(index.ids)
    best = np.zeros(n)
    best_tf: list = [None] * n
    for s, k in transforms:
        p = pk.copy()
        p[:, 0] *= s  # query frame -> reference frame
        p[:, 1] -= k
        h, t = pair_hashes(p)
        sc, off = index.score(h, t)
        better = sc > best
        for i in np.nonzero(better)[0]:
            best_tf[i] = (s, k, int(off[i]))
        best = np.maximum(best, sc)
    return best, len(pk), best_tf


def match(index: Index, y: np.ndarray, top: int = 3) -> dict:
    """Which catalogue songs the audio contains, best first, with the
    evidence a decision needs: score, the next song's score, how many
    windows of the post each song wins, and the speed/pitch it was found at."""
    duration = len(y) / FS
    bands = _tonal_bands(y) if len(y) >= NFFT else None
    pk = peaks(y, bands=bands) if bands is not None else np.zeros((0, 2))
    query_melody = melody(bands) if bands is not None else np.zeros(0, np.uint8)
    result = {"algorithm": ALGORITHM, "durationSec": round(duration, 2), "peaks": int(len(pk)), "windows": 0, "candidates": []}
    if len(index.ids) == 0 or len(pk) < 10:
        return result

    whole, _, tf = _query_peaks(index, pk, TRANSFORMS)
    ranked = np.argsort(-whole)[: max(top, 2)]
    second_overall = float(whole[ranked[1]]) if len(ranked) > 1 else 0.0

    # windows: in how many parts of the post does each candidate win?
    frames_per_sec = 1 / FRAME_SEC
    win, hop = int(WINDOW_SEC * frames_per_sec), int(WINDOW_HOP_SEC * frames_per_sec)
    last = pk[-1, 0]
    starts = [0] if last <= win else list(range(0, int(last - win) + hop, hop))
    candidate_tfs = {tf[i][:2] for i in ranked if tf[i] is not None}
    wins = np.zeros(len(index.ids), np.int64)
    for a in starts:
        sel = pk[(pk[:, 0] >= a) & (pk[:, 0] < a + win)].copy()
        if len(sel) < 10:
            continue
        sel[:, 0] -= a
        sc, _, _ = _query_peaks(index, sel, candidate_tfs)
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
            "trackId": index.ids[i],
            "score": round(float(whole[i]), 2),
            "nextScore": round(other, 2),
            "windowsWon": int(wins[i]),
            "speed": round(s, 3),
            "pitchSemitones": round(k / 2, 1),
            "songOffsetSec": round(off * FRAME_SEC, 2),
            # 2nd check: do the melody lines agree at this alignment? None when the
            # song's fingerprint predates the melody check, or too little to compare.
            "melodyAgreement": (
                None if index.melodies[i] is None
                else _round(melody_agreement(query_melody, index.melodies[i], s, k, off))
            ),
        })
    return result


def _round(value: float | None) -> float | None:
    return None if value is None else round(value, 3)
