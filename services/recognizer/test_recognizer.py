"""Tests for the recognition service: python3 -m unittest discover services/recognizer"""
import base64
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer

import numpy as np
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "..", "research", "fingerprint"))

import bekvor_fp as fp  # noqa: E402
import server  # noqa: E402
from synth import SR, make_song, make_voice  # noqa: E402


def to_fs(x):
    return resample_poly(x, fp.FS, SR).astype(np.float32)


def wav_bytes(x, sr):
    """Encode through ffmpeg, the way a real upload arrives."""
    with tempfile.TemporaryDirectory() as d:
        raw, out = os.path.join(d, "in.f32"), os.path.join(d, "out.m4a")
        x.astype("<f4").tofile(raw)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", raw, "-c:a", "aac", "-b:a", "96k", out], check=True)
        with open(out, "rb") as f:
            return f.read()


SONGS = {f"t{i}": make_song(i) for i in (1, 2, 3, 4)}


class FingerprintTest(unittest.TestCase):
    def test_round_trip(self):
        f = fp.fingerprint(to_fs(SONGS["t1"][: SR * 20]))
        g = fp.Fingerprint.from_bytes(f.to_bytes())
        self.assertTrue(np.array_equal(f.hashes, g.hashes))
        self.assertTrue(np.array_equal(f.times, g.times))
        self.assertAlmostEqual(f.duration_sec, g.duration_sec, places=2)
        self.assertGreater(len(f.hashes), 1000)

    def test_round_trip_keeps_the_melody_and_reads_old_fingerprints(self):
        f = fp.fingerprint(to_fs(SONGS["t2"][: SR * 20]))
        self.assertIsNotNone(f.melody)
        g = fp.Fingerprint.from_bytes(f.to_bytes())
        self.assertTrue(np.array_equal(f.melody, g.melody))
        old = fp.Fingerprint(f.hashes, f.times, f.duration_sec, None)
        self.assertIsNone(fp.Fingerprint.from_bytes(old.to_bytes()).melody)

    def test_refuses_other_algorithm(self):
        with self.assertRaises(ValueError):
            fp.Fingerprint.from_bytes(b"other-1\n" + b"x")

    def test_decode_refuses_a_playlist_posing_as_mp3(self):
        # an HLS playlist behind an ID3 tag must not make ffmpeg fetch URLs
        evil = b"ID3\x04\x00\x00\x00\x00\x00\x00#EXTM3U\n#EXTINF:10,\nhttp://127.0.0.1:9/x.ts\n#EXT-X-ENDLIST\n"
        with self.assertRaises(fp.AudioError):
            fp.decode(evil, 60)

    def test_decode_rejects_non_audio(self):
        with self.assertRaises(fp.AudioError):
            fp.decode(b"this is not audio at all" * 100, 60)


class MatchTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = fp.Index([(name, fp.fingerprint(to_fs(x))) for name, x in SONGS.items()])

    def test_finds_the_song_in_a_post_clip(self):
        clip = SONGS["t3"][SR * 30: SR * 55]
        r = fp.match(self.index, to_fs(clip))
        top = r["candidates"][0]
        self.assertEqual(top["trackId"], "t3")
        self.assertGreater(top["score"], 3 * top["nextScore"])
        self.assertEqual(top["windowsWon"], r["windows"])
        self.assertAlmostEqual(top["songOffsetSec"], 30, delta=0.5)
        self.assertGreater(top["melodyAgreement"], 0.8, "the melody line agrees at the found alignment")

    def test_finds_a_sped_up_song(self):
        clip = SONGS["t2"][SR * 20: SR * 50]
        sped = resample_poly(clip, 4, 5)  # played 1.25x faster, pitch up
        top = fp.match(self.index, to_fs(sped))["candidates"][0]
        self.assertEqual(top["trackId"], "t2")
        self.assertAlmostEqual(top["speed"], 1.25, delta=0.03)
        self.assertGreater(top["pitchSemitones"], 3)
        self.assertIsNotNone(top["melodyAgreement"])

    def test_voice_only_scores_low(self):
        r = fp.match(self.index, to_fs(make_voice(5, 25)))
        top = r["candidates"][0] if r["candidates"] else None
        self.assertTrue(top is None or top["score"] < 2 * max(top["nextScore"], 1))

    def test_empty_index(self):
        self.assertEqual(fp.match(fp.Index([]), to_fs(SONGS["t1"][: SR * 10]))["candidates"], [])


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.TOKEN = "test-token"
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def call(self, method, path, body=None, token="test-token", json_body=None):
        data = json.dumps(json_body).encode() if json_body is not None else body
        req = urllib.request.Request(self.base + path, data=data, method=method)
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req) as res:
                return res.status, json.loads(res.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_health_needs_no_token(self):
        status, body = self.call("GET", "/health", token=None)
        self.assertEqual(status, 200)
        self.assertEqual(body["algorithm"], fp.ALGORITHM)

    def test_refuses_without_token(self):
        self.assertEqual(self.call("POST", "/fingerprint", body=b"x", token="wrong")[0], 401)

    def test_fingerprint_index_and_match(self):
        prints = {}
        for name in ("t1", "t4"):
            status, body = self.call("POST", "/fingerprint", body=wav_bytes(SONGS[name][: SR * 60], SR))
            self.assertEqual(status, 200)
            prints[name] = body["fingerprint"]
        status, body = self.call("POST", "/match/ws1?version=v1", body=b"x")
        self.assertEqual(status, 409)
        self.assertTrue(body["needIndex"])

        status, body = self.call("PUT", "/index/ws1", json_body={"version": "v1", "tracks": [{"id": k, "fingerprint": v} for k, v in prints.items()]})
        self.assertEqual((status, body["tracks"]), (200, 2))
        status, body = self.call("POST", "/match/ws1?version=v1", body=wav_bytes(SONGS["t4"][SR * 10: SR * 35], SR))
        self.assertEqual(status, 200)
        self.assertEqual(body["candidates"][0]["trackId"], "t4")
        self.assertEqual(self.call("POST", "/match/ws1?version=v2", body=b"x")[0], 409, "a new version needs a new index")

    def test_409_reaches_the_client_even_with_a_large_body(self):
        status, body = self.call("POST", "/match/ws-big?version=v1", body=b"\0" * (30 * 1024 * 1024))
        self.assertEqual(status, 409)
        self.assertTrue(body["needIndex"])

    def test_unreadable_audio(self):
        self.assertEqual(self.call("POST", "/fingerprint", body=b"not audio" * 1000)[0], 422)

    def test_bad_workspace_id(self):
        self.assertEqual(self.call("PUT", "/index/..%2Fetc", json_body={"version": "v", "tracks": []})[0], 400)


if __name__ == "__main__":
    unittest.main()
