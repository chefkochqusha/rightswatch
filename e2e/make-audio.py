"""Generates the e2e test audio into e2e/.audio: two composed songs (MP3, WAV),
a 30-second "post" video using song A sped up under a voice (MP4), and a file
that isn't audio. Procedural music only, no real recordings.

    python3 e2e/make-audio.py
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "research", "fingerprint"))
from bench import mix_db  # noqa: E402
from synth import SR, make_song, make_voice  # noqa: E402

OUT = os.path.join(HERE, ".audio")
os.makedirs(OUT, exist_ok=True)
raw = os.path.join(OUT, "tmp.f32")


def encode(x, name, extra):
    x.astype("<f4").tofile(raw)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", raw, *extra, os.path.join(OUT, name)], check=True)


a, b = make_song(101), make_song(102)
encode(a, "song-a.mp3", ["-c:a", "libmp3lame", "-b:a", "192k"])
encode(b, "song-b.wav", [])
post = mix_db(a[SR * 40: SR * 75], make_voice(5, 36), -6)
post.astype("<f4").tofile(raw)
subprocess.run([
    "ffmpeg", "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=black:s=360x640:r=15:d=35",
    "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", raw,
    "-af", f"asetrate={int(SR * 1.15)},aresample=44100", "-shortest",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
    os.path.join(OUT, "post.mp4"),
], check=True)
with open(os.path.join(OUT, "not-audio.pdf"), "wb") as f:
    f.write(b"%PDF-1.7\n" + b"x" * 1000)
os.remove(raw)
print("e2e audio written to", OUT)
