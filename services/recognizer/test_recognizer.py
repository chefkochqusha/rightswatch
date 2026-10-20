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

    def test_current_format_stores_peaks_and_is_compact(self):
        f = fp.fingerprint(to_fs(SONGS["t3"][: SR * 60]))
        data = f.to_bytes()
        self.assertTrue(data.startswith(b"bekvor-lp-2\n"))
        g = fp.Fingerprint.from_bytes(data)
        self.assertTrue(np.array_equal(f.peaks, g.peaks))
        self.assertTrue(np.array_equal(f.hashes, g.hashes), "pair hashes come out the same after a reload")
        hash_format = fp.Fingerprint(f.hashes, f.times, f.duration_sec, f.melody).to_bytes()
        self.assertLess(len(data), len(hash_format) / 2)

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

    def test_a_clear_post_needs_no_second_pass(self):
        r = fp.match(self.index, to_fs(SONGS["t3"][SR * 30: SR * 55]))
        self.assertNotIn("densePass", r)

    def test_the_second_pass_keeps_scores_on_the_first_pass_scale(self):
        """A post nothing stands out in gets the denser second pass; its scores
        are scaled back, so noise and voice stay under the app's minimum (60)."""
        for y in (to_fs(make_voice(5, 25)), np.random.default_rng(3).standard_normal(fp.FS * 25).astype(np.float32) * 0.1):
            r = fp.match(self.index, y)
            top = r["candidates"][0] if r["candidates"] else None
            self.assertTrue(top is None or top["score"] < 60, r)

    def test_the_second_pass_finds_music_under_a_voice(self):
        import real_test

        clip = to_fs(SONGS["t2"][SR * 20: SR * 45])
        post = real_test.mix(clip, to_fs(make_voice(7, 27)), -9)
        top = fp.match(self.index, post)["candidates"][0]
        self.assertEqual(top["trackId"], "t2")


class LargeCatalogueTest(unittest.TestCase):
    """Above RECOGNIZER_SHORTLIST_FROM songs a post is shortlisted first (shortlist.py)."""

    @classmethod
    def setUpClass(cls):
        tracks = [(name, fp.fingerprint(to_fs(x))) for name, x in SONGS.items()]
        # an old hash-only fingerprint can't be shortlisted: it is always checked
        old = fp.fingerprint(to_fs(make_song(9)))
        tracks.append(("legacy", fp.Fingerprint(old.hashes, old.times, old.duration_sec, old.melody)))
        cls.index = fp.Index(tracks, shortlist_from=2)

    def test_a_hard_post_is_found_by_the_wider_passes(self):
        """A post the first 50 don't settle goes on to the wider and the dense
        pass, and the result leaks nothing internal."""
        import real_test

        clip = to_fs(SONGS["t2"][SR * 20: SR * 45])
        r = fp.match(self.index, real_test.mix(clip, to_fs(make_voice(7, 27)), -12))
        self.assertNotIn("_parts", r)
        self.assertEqual(r["candidates"][0]["trackId"], "t2")
        clean = fp.match(self.index, clip)
        self.assertNotIn("_parts", clean)
        self.assertNotIn("densePass", clean)

    def test_uses_the_shortlist(self):
        self.assertTrue(self.index.large)
        self.assertIn(4, self.index.candidates(fp.peaks(to_fs(SONGS["t1"][SR * 10: SR * 30]))), "legacy songs are always checked")

    def test_finds_a_song_through_the_shortlist(self):
        r = fp.match(self.index, to_fs(SONGS["t3"][SR * 30: SR * 55]))
        self.assertGreaterEqual(r["shortlisted"], 1)
        self.assertEqual(r["candidates"][0]["trackId"], "t3")
        self.assertAlmostEqual(r["candidates"][0]["songOffsetSec"], 30, delta=0.5)

    def test_finds_a_sped_up_song_through_the_shortlist(self):
        sped = resample_poly(SONGS["t2"][SR * 20: SR * 50], 4, 5)
        top = fp.match(self.index, to_fs(sped))["candidates"][0]
        self.assertEqual(top["trackId"], "t2")
        self.assertAlmostEqual(top["speed"], 1.25, delta=0.03)

    def test_the_shortlist_knows_the_speed(self):
        from shortlist import speed_of_bin

        sped = resample_poly(SONGS["t2"][SR * 20: SR * 50], 4, 5)  # played 1.25x as fast
        found = dict(self.index.candidates_with_speed(fp.peaks(to_fs(sped)), 5))
        t2 = self.index.ids.index("t2")
        self.assertAlmostEqual(speed_of_bin(found[t2]), 1.25, delta=0.04)
        self.assertIsNone(found[self.index.ids.index("legacy")], "no peaks, no speed: every transform")

    def test_transforms_near_a_speed(self):
        from shortlist import SPEED_BIN_ZERO

        fast = fp._transforms_near(SPEED_BIN_ZERO + 8)  # bin of speed 1.26
        self.assertTrue(fast and all(abs(np.log(s / 1.26)) <= fp.SPEED_WINDOW for s, _ in fast))
        self.assertTrue(any(abs(s - 1.25) < 0.005 for s, _ in fast), "the grid point at the real speed")
        self.assertFalse(any(s == 1.0 for s, _ in fast))
        normal = fp._transforms_near(SPEED_BIN_ZERO)
        self.assertEqual({k for s, k in normal if s == 1.0}, set(range(-8, 9)), "pitch-only changes live at speed 1")
        self.assertEqual(fp._transforms_near(None), fp.TRANSFORMS)

    def test_guided_scores_equal_a_full_search_for_the_right_song(self):
        """The transforms near the shortlist's speed hold the best one: the
        right song scores the same as when every transform is tried."""
        for post in (to_fs(SONGS["t2"][SR * 20: SR * 45]), to_fs(resample_poly(SONGS["t2"][SR * 20: SR * 50], 4, 5))):
            grids = fp.post_peaks(fp._tonal_spectrum(post))
            t2 = self.index.ids.index("t2")
            guided = {self.index.ids[p]: None for p, _ in self.index.candidates_with_speed(grids[0], 5)}
            parts = fp._guided_parts(self.index, grids, 5, 1, {})
            score = {tid: w for part, whole, _ in parts for tid, w in zip(part.ids, whole)}
            full = fp._query_peaks(self.index.subset([t2]), grids, fp.TRANSFORMS)[0][0]
            self.assertIn("t2", guided)
            self.assertAlmostEqual(score["t2"], full, places=6)

    def test_a_sped_up_post_is_read_on_the_grid_nearest_its_pitch(self):
        """1.25x moves the pitch 7.73 log bins: the two-thirds grid, 7 bins over."""
        grids = {0: np.zeros((1, 2)), 1: np.ones((1, 2)), 2: np.full((1, 2), 2.0)}
        pk, k = fp._aligned(grids, 1.25, 8)
        self.assertIs(pk, grids[2])
        self.assertEqual(k, 7)
        self.assertIs(fp._aligned(grids, 1.25, 0)[0], grids[0], "tempo only: the plain grid")
        self.assertEqual(fp._aligned(grids, 1.0, -6), (grids[0], -6), "pitch only, whole bins")
        self.assertEqual(fp._aligned(grids, 0.85, -6)[1], -6, "0.85x: -5.63 bins = 6 bins down on the one-third grid")
        self.assertIs(fp._aligned(grids, 0.85, -6)[0], grids[1])

    def test_finds_a_legacy_song(self):
        top = fp.match(self.index, to_fs(make_song(9)[SR * 20: SR * 45]))["candidates"][0]
        self.assertEqual(top["trackId"], "legacy")

    def test_a_changed_catalogue_reuses_unchanged_shards_and_matches_like_a_fresh_one(self):
        old = fp.SHARD_SONGS
        fp.SHARD_SONGS = 1  # one song per shard here, so reuse is visible
        try:
            # 5 songs -> 8 shards; ids picked so each song has its own shard
            # (crc32 % 8: t1 7, t2 5, t3 3, t4 0, s5 1, t5 6)
            songs = {name: fp.fingerprint(to_fs(x)) for name, x in SONGS.items()}
            songs["s5"] = fp.fingerprint(to_fs(make_song(11)))
            before = fp.Index(list(songs.items()), shortlist_from=1)
            # t4 removed, t5 added, t2 changed (re-uploaded)
            changed = fp.fingerprint(to_fs(SONGS["t2"][: SR * 50]))
            after_tracks = [("t1", songs["t1"]), ("t2", changed), ("t3", songs["t3"]), ("s5", songs["s5"]), ("t5", fp.fingerprint(to_fs(make_song(12))))]
            updated = fp.Index(after_tracks, shortlist_from=1, previous=before)
            fresh = fp.Index(after_tracks, shortlist_from=1)
            self.assertEqual(updated.n_shards, 8)
            self.assertEqual(updated.rebuilt_shards, 2, "only the changed and the new song's shards")
            self.assertEqual(fresh.rebuilt_shards, 5)
            self.assertTrue(np.array_equal(updated.df, fresh.df), "rarity counts updated, not recounted")
            post = to_fs(SONGS["t3"][SR * 20: SR * 45])
            a, b = fp.match(updated, post), fp.match(fresh, post)
            self.assertEqual(a["candidates"][0]["trackId"], "t3")
            self.assertEqual(a["candidates"], b["candidates"])
        finally:
            fp.SHARD_SONGS = old

    def test_looks_further_down_the_shortlist_only_when_no_song_stands_out(self):
        old = fp.SHORTLIST_SIZE, fp.SHORTLIST_WIDE
        fp.SHORTLIST_SIZE, fp.SHORTLIST_WIDE = 1, 5
        try:
            clear = fp.match(self.index, to_fs(SONGS["t3"][SR * 30: SR * 55]))
            self.assertEqual(clear["candidates"][0]["trackId"], "t3")
            self.assertEqual(clear["shortlisted"], 2, "the best song (and the legacy one) settle it")
            unclear = fp.match(self.index, to_fs(make_song(31)[SR * 10: SR * 35]))
            self.assertGreater(unclear["shortlisted"], 2, "a post of no catalogue song looks further")
        finally:
            fp.SHORTLIST_SIZE, fp.SHORTLIST_WIDE = old

    def test_shards_give_the_same_shortlist(self):
        from shortlist import ShardedShortlist, ShortlistIndex
        songs = [fp.fingerprint(to_fs(x)).peaks for x in SONGS.values()]
        post = fp.peaks(to_fs(SONGS["t2"][SR * 15: SR * 40]))
        one = ShortlistIndex(songs).shortlist(post, 3)
        sharded = ShardedShortlist.build(songs, shard_size=1).shortlist(post, 3)
        self.assertEqual(int(one[0]), int(sharded[0]))
        self.assertEqual(list(SONGS)[int(sharded[0])], "t2")


class CompiledPathsTest(unittest.TestCase):
    """With numba installed, the hot loops run compiled. They must give exactly
    the numpy results, not just close ones: the app's thresholds were set on them."""

    def setUp(self):
        if fp._pair_hashes_fast is None:
            self.skipTest("numba not installed")

    def test_pair_hashes_are_identical(self):
        rng = np.random.default_rng(11)
        for _ in range(60):
            n = int(rng.integers(0, 2500))
            pk = np.c_[np.sort(rng.uniform(0, 2500, n)) * rng.uniform(0.75, 1.35), rng.uniform(-20, 280, n)]
            for fanout, lookahead in ((fp.FANOUT, fp.LOOKAHEAD), (fp.FANOUT * 2, fp.LOOKAHEAD * 2)):
                fast, plain = fp.pair_hashes(pk, fanout, lookahead), fp._pair_hashes_numpy(pk, fanout, lookahead)
                np.testing.assert_array_equal(fast[0], plain[0])
                np.testing.assert_array_equal(fast[1], plain[1])
                self.assertEqual(fast[0].dtype, plain[0].dtype)

    def test_scores_and_shortlist_are_identical(self):
        import shortlist as sl

        songs = [(f"s{i}", fp.fingerprint(to_fs(make_song(i, seconds=30)))) for i in range(1, 9)]
        index = fp.Index(songs, shortlist_from=4)
        post = to_fs(make_song(3, seconds=30)[SR * 5: SR * 20])
        pk = fp.peaks(post)
        h, tq = fp.pair_hashes(pk)
        fast = index.subset(index.candidates(pk, 8)).score(h, tq)
        saved = fp._dense_votes_fast, sl._best_per_song_fast, sl._votes_fast
        try:
            fp._dense_votes_fast, sl._best_per_song_fast, sl._votes_fast = None, None, None
            plain = index.subset(index.candidates(pk, 8)).score(h, tq)
            plain_match = fp.match(index, post)
        finally:
            fp._dense_votes_fast, sl._best_per_song_fast, sl._votes_fast = saved
        np.testing.assert_array_equal(fast[0], plain[0])
        np.testing.assert_array_equal(fast[1], plain[1])
        self.assertEqual(json.dumps(fp.match(index, post), sort_keys=True), json.dumps(plain_match, sort_keys=True))

        rng = np.random.default_rng(5)
        for _ in range(50):
            n, m = int(rng.integers(1, 40)), int(rng.integers(0, 4000))
            cell = (rng.integers(0, n, m) * 64 + rng.integers(0, 40, m)) * (1 << 16) + (rng.integers(-300, 300, m) + (1 << 15))
            uk, c = np.unique(cell, return_counts=True)
            fast_best, fast_cell = sl._best_per_song_fast(uk, c, n)
            plain_best, plain_cell = sl._best_per_song(uk, c, n)
            np.testing.assert_array_equal(fast_best, plain_best)
            np.testing.assert_array_equal(fast_cell, plain_cell)


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

    def test_index_from_a_list_staged_fingerprints_and_the_previous_index(self):
        prints = {}
        for name in ("t1", "t4"):
            prints[name] = self.call("POST", "/fingerprint", body=wav_bytes(SONGS[name][: SR * 60], SR))[1]["fingerprint"]
        listing = [{"id": k, "key": f"{k}@1"} for k in prints]
        status, body = self.call("PUT", "/index/ws-sync", json_body={"version": "v1", "tracks": listing})
        self.assertEqual((status, sorted(body["missing"])), (409, ["t1", "t4"]))
        status, body = self.call("POST", "/index/ws-sync/tracks", json_body={"tracks": [{"id": "t1", "key": "t1@1", "fingerprint": prints["t1"]}]})
        self.assertEqual((status, body["staged"]), (200, 1))
        self.assertEqual(self.call("PUT", "/index/ws-sync", json_body={"version": "v1", "tracks": listing})[1]["missing"], ["t4"])
        self.call("POST", "/index/ws-sync/tracks", json_body={"tracks": [{"id": "t4", "key": "t4@1", "fingerprint": prints["t4"]}]})
        old_limit = fp.SHORTLIST_FROM
        fp.SHORTLIST_FROM = 1  # take the large-catalogue path, which can be reused
        try:
            self.assertEqual(self.call("PUT", "/index/ws-sync", json_body={"version": "v1", "tracks": listing})[0], 200)
            # a new version with the same songs: nothing has to be sent again
            status, body = self.call("PUT", "/index/ws-sync", json_body={"version": "v2", "tracks": listing})
            self.assertEqual((status, body["tracks"]), (200, 2))
            status, body = self.call("POST", "/match/ws-sync?version=v2", body=wav_bytes(SONGS["t4"][SR * 10: SR * 35], SR))
            self.assertEqual(body["candidates"][0]["trackId"], "t4")
            # a changed fingerprint (new key) is missing again
            changed = [{"id": "t1", "key": "t1@2"}, {"id": "t4", "key": "t4@1"}]
            self.assertEqual(self.call("PUT", "/index/ws-sync", json_body={"version": "v3", "tracks": changed})[1]["missing"], ["t1"])
        finally:
            fp.SHORTLIST_FROM = old_limit

    def test_staging_refuses_unreadable_fingerprints(self):
        status, _ = self.call("POST", "/index/ws1/tracks", json_body={"tracks": [{"id": "x", "key": "1", "fingerprint": "bm90IGEgZmluZ2VycHJpbnQ="}]})
        self.assertEqual(status, 400)

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


class DecideTest(unittest.TestCase):
    """The Python copy of the app's decision rule agrees with the app on the
    shared cases (`decide_cases.json`, also run by decide-shared.test.ts)."""

    def test_shared_cases(self):
        import decide

        with open(os.path.join(HERE, "decide_cases.json"), encoding="utf-8") as f:
            cases = json.load(f)["cases"]
        for case in cases:
            with self.subTest(case["name"]):
                self.assertEqual(decide.decide(case["result"], case.get("thresholds"))["outcome"], case["outcome"])


class RealTestScriptTest(unittest.TestCase):
    """`real_test.py` end to end on composed songs written as files."""

    def test_folders_labels_edits_and_exit_code(self):
        import real_test

        with tempfile.TemporaryDirectory() as d:
            songs, posts = os.path.join(d, "songs"), os.path.join(d, "posts")
            os.makedirs(songs)
            os.makedirs(posts)
            for name, seed in (("alpha", 1), ("beta", 2), ("gamma", 3)):
                with open(os.path.join(songs, f"{name}.m4a"), "wb") as f:
                    f.write(wav_bytes(SONGS[f"t{seed}"], SR))
            clip = SONGS["t2"][10 * SR : 35 * SR]
            with open(os.path.join(posts, "beta__clip.m4a"), "wb") as f:
                f.write(wav_bytes(clip, SR))
            with open(os.path.join(posts, "none__other.m4a"), "wb") as f:
                f.write(wav_bytes(SONGS["t4"][: 25 * SR], SR))
            with open(os.path.join(posts, "unlabelled.m4a"), "wb") as f:
                f.write(wav_bytes(SONGS["t1"][: 25 * SR], SR))
            labels = os.path.join(d, "labels.csv")
            with open(labels, "w", encoding="utf-8") as f:
                f.write("post,song\nunlabelled.m4a,alpha\n")
            out = os.path.join(d, "out.json")
            code = real_test.main([songs, posts, "--labels", labels, "--edits", "--json", out])
            with open(out, encoding="utf-8") as f:
                cases = json.load(f)["cases"]
        by_post = {c["post"]: c for c in cases if c["kind"] == "post"}
        self.assertEqual(by_post["beta__clip.m4a"]["found"], "beta")
        self.assertEqual(by_post["unlabelled.m4a"]["found"], "alpha")
        self.assertNotEqual(by_post["none__other.m4a"]["outcome"], "MATCH")
        # every song's edits are run with and without the song in the catalogue
        self.assertEqual(sum(c["kind"] == "edit" for c in cases), sum(c["kind"] == "edit, song not in catalogue" for c in cases))
        self.assertGreaterEqual(sum(c["kind"] == "edit" for c in cases), 3 * 7)
        self.assertEqual(code, 1 if any(c["verdict"] in ("FALSE MATCH", "WRONG SONG") for c in cases) else 0)

    def test_refuses_a_label_for_a_song_that_isnt_there(self):
        import real_test

        with self.assertRaises(SystemExit):
            real_test.labels_from(["/x/missing__a.mp4"], None, {"alpha"})
