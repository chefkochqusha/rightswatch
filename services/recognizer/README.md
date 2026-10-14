# Song recognition service

Bekvor's own song recognition (no outside recognition service): it finds a customer's catalogue
songs in a post's audio, even sped up, slowed, pitch-shifted, compressed or
under a voice-over. Method and first results: `research/fingerprint/README.md`.
Own code (numpy/scipy); no third-party recognition licence applies.

## How it fits in

```
browser ──upload──▶ app (/api/uploads/…) ──file──▶ upload disk (deleted after reading)
                     │ queues a job (Postgres)
                     ▼
                  worker (in the app process)
                     │  POST /fingerprint  (a song)      → fingerprint stored in Postgres
                     │  PUT  /index/<ws>   (when changed: the song list; the     → index kept in memory here
                     │       fingerprints it lacks go in batches to .../tracks)
                     │  POST /match/<ws>   (a post)       → candidates → decision (app)
                     ▼
                  recognizer (this service, private network only)
```

- **Keeps nothing.** Fingerprints live in Postgres (so the nightly backup
  covers them); this service holds a few workspaces' indexes in memory. When
  the catalogue's version changes the app sends the list of songs with a key
  per fingerprint; the service reuses what its previous index holds (large
  catalogues) and names what it's missing, which the app sends in batches of
  500. A one-song change sends one fingerprint, not 20,000. Uploaded audio is
  decoded through a temporary file deleted at once.
- **The decision is the app's** (`src/modules/recognition/decide.ts`): MATCH
  (clearly ahead of every other song and found in at least half of the post),
  CANDIDATE (ahead, but less clearly) or NO_MATCH. Both MATCH and CANDIDATE are
  shown to a person, who confirms with one click; only with
  `RECOGNITION_AUTO_IDENTIFY=true` does a MATCH identify the post's song by
  itself.
- **Auth:** `Authorization: Bearer $RECOGNIZER_TOKEN` on everything but `/health`.

## Calibration (2026-10-10, synthetic songs)

`python3 calibrate.py 30 15`: 30 catalogue songs, a 20–45 s "post" from each
under 12 edits (360 posts), and 75 posts without a catalogue song (other songs
with the same chord progressions, alone, under a voice, sped up; voice only;
noise only). Default thresholds (match ratio 3, candidate ratio 1.6, minimum
score 60, half the windows):

| Post | Top song right | MATCH | CANDIDATE | nothing |
|---|---|---|---|---|
| Clean / AAC 64 kbit/s | 100 % | 26/30 | 4 | 0 |
| Phone speaker + room | 100 % | 24 | 5 | 1 |
| Pitch −3 semitones | 100 % | 23 | 5 | 2 |
| Tempo 1.2×, pitch kept | 97 % | 22 | 6 | 2 |
| Sped up 1.25× (pitch up) | 100 % | 15 | 11 | 4 |
| Noise 10 dB below the music | 93 % | 16 | 8 (+1 wrong) | 5 |
| Voice-over, music −6 dB | 90 % | 15 | 10 | 5 |
| Voice-over, music −12 dB | 87 % | 11 | 12 (+1 wrong) | 6 |
| Song only in the second half | 90 % | 10 | 14 | 6 |
| Slowed 0.85× (pitch down) | 87 % | 1 | 15 | 14 |
| Worst case: 1.2× + voice + phone + AAC | 37 % | 0 | 1 (+2 wrong) | 27 |
| **No catalogue song (75)** | — | **1** | **11** | 63 |

- The one wrong MATCH was a synthetic look-alike: same chords, same instrument
  sounds. Real recordings differ far more, but this is why results are
  suggestions by default.
- No wrong MATCH among the 360 posts of catalogue songs; wrong songs only ever
  appeared as CANDIDATE (4 times), where a person decides.
- Speed: about 1 s per 20–45 s post on one core with 30 songs (1.9 s at most).
  Fingerprinting a 90 s song: about 1 s.

## Second check: the melody (2026-10-10)

Landmark votes can be fooled by a different song with the same chords and
instruments (the one wrong MATCH above). So every candidate also gets a
`melodyAgreement`: the strongest tonal band above ~320 Hz per frame (the
melody line), compared between post and song at the alignment the landmarks
found, within a quarter tone, octave errors forgiven. The song's melody line
is stored in its fingerprint (format `bekvor-lp-1+mel1`; older fingerprints
still match, but without this check, so their songs can only be suggested
until the recording is uploaded again).

Experiment (15 catalogue songs × 7 edits, 45 posts of other songs): an
automatic MATCH now also needs melody agreement ≥ 0.7.

| | Sure matches kept | Sure matches turned into suggestions |
|---|---|---|
| Clean / tempo 1.2× | 14 / 9 | 0 / 0 |
| Pitch −3 st / slowed 0.85× | 6 / 2 | 6 / 1 |
| Sped up 1.25× | 1 | 6 |
| Voice-over −6 / −12 dB | 0 / 0 | 9 / 6 |
| **Other songs that passed the landmark rule** | **0** | 2 (now suggestions) |

So: no false automatic match left in the test set; the price is that
voice-overs and strong speed-ups become suggestions a person confirms, which
is the safe direction. `RECOGNITION_MIN_MELODY` changes the 0.7.

**Round 2 with real music is still needed** (20–50 real songs and some real
TikTok posts): re-run the calibration on them and set the thresholds through
`RECOGNITION_MATCH_RATIO`, `RECOGNITION_CANDIDATE_RATIO` and
`RECOGNITION_MIN_SCORE`.

## Real recordings (2026-10-11)

`research/fingerprint/real_music.py`: four openly licensed real songs
(Brahms' Hungarian Dance No. 5 by the US Army Strings, public domain;
"Let's Go Fishin'" by Karissa Hobbs, a sung song; "Dance of the Sugar Plum
Fairy" and "Vibe Ace" by Kevin MacLeod; CC BY) from librosa's example data,
real speech (LibriVox readings, CC BY) as the voice-over, 4 posts per song
and edit. Right song on top, of 16:

| Post | 34-song catalogue | Among 2,000 | Among 2,000, second round | + denser pass (2026-10-12) |
|---|---|---|---|---|
| Clean / AAC 64 kbit/s / phone + room | 16 | 16 | 16 | 16 |
| Voice-over, music −6 dB | 16 (9 MATCH) | 16 (10 MATCH) | 16 (10 MATCH) | 16 (11 MATCH) |
| Voice-over, music −12 dB | 16 | 10 | **15** | **16** |
| Sped up 1.25× | 16 (15 MATCH) | 16 (15 MATCH) | 16 (15 MATCH) | 16 (15 MATCH) |
| Slowed 0.85× | 16 | 14 | **16** | 16 |
| Tempo 1.2×, pitch kept / pitch −3 st | 16 | 16 | 16 | 16 |
| Worst case (1.2× + voice + phone + AAC) | 14 | 2 | **11** | **12** |

Every miss among 2,000 was a shortlist miss, often just below the cut (rank
50–150): whenever the right song was among the 50, the precise check put it
on top. Hence the **second round**: when no song stands out clearly (3× the
next) among the first 50, the precise check also runs on the shortlist's
places 51–200 (`RECOGNIZER_SHORTLIST_WIDE`). Clear posts cost the same; hard
posts take longer. In the synthetic 2,000-song test (where most posts are
unclear) right-on-top went from 29/22/19/17/1 to 30/25/25/25/3 of 40 (voice
−6 dB / voice −12 dB / sped up / slowed / worst), still no false MATCH, at
5.1 s instead of 2.2 s per post (median; p95 7.3 s). Real posts mostly stand
out in the first round (median 1.8 s). With the denser second pass (below):
still no false MATCH among 2,000 (10 posts without a catalogue song: 0 MATCH,
1 suggestion), median 2.5 s per post.

Real recordings stand out far more than the composed songs (median ratio to
the next song 27–33 for clean posts, 11–12 when sped up), so the losses in
the large synthetic catalogues above are mostly the test data. Still the
weakest: edits stacked on top of each other (worst case), found but mostly
only as a suggestion. Real speech and a whale recording were never identified as
a song; the one false MATCH in this run was a composed song taken for
another composed song with the same chords (the known synthetic look-alike).
Only four real songs, among composed distractors: round 2 with a customer's
real catalogue is still the real test.

## Compared with open source (2026-10-11)

`research/fingerprint/compare_audfprint.py`: the same 30 songs and posts in
audfprint (MIT, the classic Shazam-style method, as in Dejavu) and in Bekvor.
Right song on top, of 30:

| Post | audfprint | Bekvor |
|---|---|---|
| Clean | 30 | 30 |
| Voice-over, music −6 dB | 30 | 29 |
| Sped up 1.25× (pitch follows) | **0** | 28 |
| Slowed 0.85× (pitch follows) | **0** | 29 |
| Tempo 1.2×, pitch kept | **0** | 30 |
| Pitch −3 semitones | 24 | 30 |

The classic method doesn't survive the speed and pitch changes TikTok posts
use all the time; that's why Bekvor searches over speed and pitch. Panako
(which also does) is AGPL-licensed and names the same patents, so it was not
used.

## Large catalogues (2026-10-11)

Above `RECOGNIZER_SHORTLIST_FROM` songs (200) a post is first narrowed to a
shortlist of `RECOGNIZER_SHORTLIST_SIZE` songs (50) in one pass
(`shortlist.py`: peak triplets whose key a speed or pitch change leaves
alone), and the precise check above runs on the shortlist only, with the
whole catalogue's rarity weights. Fingerprints are stored as peaks
(`bekvor-lp-2`, a third of the hash format), so the index keeps peaks and
triplets, not pair hashes, and the triplet table is built in shards of 2,000
songs. Triplet extraction is compiled with numba (25× faster, numpy fallback).

`scale_bench.py N K BASES` measures it: K composed catalogue songs queried
under edits, the rest distractors (transposed and re-timed versions of other
composed songs), 48 posts of songs not in the catalogue. On this 2-core
development machine:

| Catalogue | Index in memory | Build | Time per post (median) | False MATCH |
|---|---|---|---|---|
| 300 | 41 MB | 16 s | 1.3 s (was 12 s before this round) | 0 |
| 2,000 | 209 MB | 17 s | 2.2 s | 0 of 48 |
| 20,000 | 2.0 GB (3.7 GB peak while building) | 4 min | 9.9 s (p95 18 s) | 0 of 48 |

Right song on top, by edit, as the catalogue grows (synthetic songs; the 2,000 run was made before both pitch roundings were tried for sped-up and slowed posts, the others after):

| Post | 30 songs | 2,000 | 20,000 |
|---|---|---|---|
| Clean / AAC 64 kbit/s | 100 % | 100 % | 100 % |
| Phone speaker + room | 100 % | 100 % | 100 % |
| Voice-over, music −6 dB | 97 % | 73 % | 60 % |
| Voice-over, music −12 dB | 87 % | 55 % | 45 % |
| Sped up 1.25× | 93 % | 48 % | 20 % |
| Slowed 0.85× | 97 % | 43 % | 60 % |
| Worst case (1.2× + voice + phone + AAC) | 43 % | 3 % | 0 % |

**What this means.** Clean, compressed and phone-recorded posts are found
at any size, and no post of a song outside the catalogue was ever identified
as one (MATCH). Heavily edited posts get lost in large catalogues: the
shortlist misses them (at 2,000 songs the right song wasn't among the 50 in
4 of 15 sped-up and 4 of 15 voice-over posts). Part of that is the test
data: there are only six chord progressions among the composed songs, and
the distractors are transposed copies, so thousands of them share a song's
harmony, which real catalogues don't. Round 2 with real music decides how
much. Tried without gain: looking up neighbouring triplet cells, weighting
triplets by rarity, more and denser query triplets, sub-bin peak positions
(worse). The next step for edited posts is a second, learned stage
(`RELEASE_CHECKLIST.md`).

**Catalogue changes** (measured at 10,000 songs): the full build takes 2.5
minutes; after adding or removing one song the service rebuilds only that
song's shard (shards by song id, 2,000 songs each, a power of two of them)
and updates the rarity counts by difference: 6 seconds, same result as a
fresh build (tested).

Memory: about 100 KB per song. A server for the Agency plan's 20,000 songs
needs 8 GB RAM for one such workspace (16 GB to be comfortable);
`RECOGNIZER_CACHED_WORKSPACES` limits how many are kept.

## Second, denser pass for hard posts (2026-10-12)

Under a voice-over the voice takes many of the strongest peaks, and the
song's own peaks are often the next ones down. So when no song is clearly
ahead (3× the next) in at least half of the post, `match` reads the post a
second time with twice the peaks per second and twice the pairs per peak
(`DENSE_FACTOR`), and keeps the pass with the clearer leader (the result
then says `densePass`). More pairs also mean more chance votes, so the dense
pass's scores are divided by `DENSE_SCORE_SCALE` (1.6, what songs that aren't
in the post gained) and the app's minimum score keeps its meaning. Clear
posts never pay for the second pass.

In large catalogues the second pass doesn't search again: it re-scores the
songs the first pass shortlisted (the same small indexes, not rebuilt) and
only at the speeds and pitches near where the first pass found its best
songs. Searching 20,000 songs again with twice the peaks had taken 40–50 s
per hard post. Synthetic 2,000-song test (`scale_bench.py 2000 20`, before →
after): posts with no song found 62 → 48 of the 120 hard ones (voice −6 dB
7 → 2, voice −12 dB 9 → 5, sped up 11 → 9, slowed 16 → 15, worst case
19 → 17); no wrong MATCH; posts without a catalogue song still 0 MATCH and
1 suggestion of 48; median 7.8 → 9.6 s, p95 10.8 → 13.4 s per post (two
runs in parallel on two cores).

20,000 songs (`scale_bench.py 20000 20`, `RECOGNIZER_DENSE_PASS=0` against
the default): 7 more hard posts found (voice −6 dB nothing found 8 → 6,
voice −12 dB 13 → 9, slowed 18 → 17), 2 more automatic matches (phone +
room); no wrong MATCH, and 0 MATCH and 0 suggestions for the 48 posts without
a catalogue song either way. Median 19.8 → 22.1 s, p95 30.2 → 34.2 s per
post. So at this size the time goes into the search itself (the shortlist
and its second round), not into the second pass: one core handles roughly
4,000 posts a day. `RECOGNIZER_DENSE_PASS=0` turns the pass off.

Four real recordings (`real_test.py --edits --voice`, 84 cases): posts
missed 4 → 2 of 42, found or suggested 38 → 40, still no false match, no
wrong song and no false suggestion.

Synthetic calibration (`calibrate.py 30 15`, 360 posts of catalogue songs,
75 without):

| Post | Missed before → after |
|---|---|
| Voice-over, music −6 dB | 5 → 1 |
| Voice-over, music −12 dB | 6 → 3 |
| Worst case: 1.2× + voice + phone + AAC | 27 → 22 |
| Slowed 0.85× | 7 → 5 |
| Song only in the second half | 6 → 4 |
| Pitch −3 st / phone + room | 2 → 0 / 1 → 0 |
| **All 360** | **65 → 45** |

Posts without a catalogue song: still no MATCH; suggestions 12 → 13 (one
more "other song + voice" for a person to dismiss). Automatic matches rose
on their own too (pitch −3 st 9 → 11, phone + room 19 → 21). Time per post:
median 1.0 → 1.3 s, slowest 1.6 → 3.6 s (only hard posts take the second
pass).

## Where large catalogues lose time and posts (2026-10-14)

Measured on the shortlist alone (synthetic, 20 catalogue songs among 2,000
and 20,000, rank of the right song among the 400 best):

| | 2,000: in the first 200 | 20,000: in the first 200 |
|---|---|---|
| Sped up 1.25× | 15 of 20 | 7 of 20 |
| Slowed 0.85× | 20 | 18 |
| Voice-over −12 dB | 17 | 12 |
| Worst case | 2 | 0 |

- **Sped-up posts and voice-overs are lost in the shortlist.** Reading the
  post with twice the peaks for the shortlist helps them (20,000: sped up
  7 → 11, voice 12 → 15) but hurts slowed posts (18 → 15) and costs 4.5 s
  more per post, so it isn't used.
- **Slowed posts are lost later:** the right song is in the shortlist and
  usually on top of the precise check, but under the minimum score.
- **The shortlist is the slow part at 20,000 songs: 11 of the ~20 s per
  post.** Half of it is sorting and looking up vote cells (`np.unique` and
  `searchsorted` in `ShortlistIndex.scores`). A compiled vote count could
  roughly halve it; worth doing once a customer has that many songs.
- The worst case (sped up + voice + phone + AAC) is out of reach for
  landmarks at this size. That, and the sped-up posts, is the case for a
  learned second stage (nearest-neighbour search over embeddings scales to
  large catalogues by design).

## Your own music: `real_test.py` (round 2)

The test to run before relying on recognition: the songs you have the rights
to, and real posts that use some of them. Runs on any computer with Python,
the packages in `requirements.txt` and ffmpeg; nothing leaves the computer.

    python3 services/recognizer/real_test.py SONGS/ POSTS/ --edits --voice speech.mp3

- `SONGS/`: one file per song; the file name (without extension) is its name.
- `POSTS/`: the posts, named `<song name>__anything.mp4`, or `none__x.mp4`
  for a post that uses no catalogue song (these matter most: they show false
  matches). Or list them in a CSV (`--labels labels.csv`, columns `post,song`).
- `--edits`: also cuts TikTok-style posts from every song (30 s clip, 20 s
  from the middle, AAC, noise, sped up, slowed, phone, and with `--voice` a
  voice-over at -6 and -12 dB and a combined edit) and checks each twice:
  with the song in the catalogue (should be found) and without it (nothing
  should be found).

It prints one line per post with the app's decision (`decide.py`, the same
rule as `src/modules/recognition/decide.ts`; both run the cases in
`decide_cases.json`), a summary, and threshold suggestions for the app's
environment. The exit code is 1 when any post got a FALSE MATCH or a WRONG
SONG.

First run on the four openly licensed recordings from "Real recordings"
(2026-10-12; LibriVox speech as the voice): 84 cases, 0 false matches, 0
wrong songs. Of the 42 posts that use a catalogue song, 34 were identified
on their own, 4 suggested for a person to confirm, 4 missed (one song,
Vibe Ace, under a voice-over; the combined 1.2× + voice + AAC edit of
another). The misses scored 39–49, the best wrong song 50: the minimum
score of 60 is what keeps wrong songs out, so lowering it isn't safe.

## Run and test

```bash
python3 -m unittest discover -s services/recognizer -p "test_*.py"   # 21 tests
RECOGNIZER_TOKEN=dev PORT=8090 python3 services/recognizer/server.py
```

Needs `ffmpeg`, numpy and scipy (`requirements.txt`). In production it runs
from `Dockerfile` as the `recognizer` service in `deploy/compose.yml`.

## Patents

Landmark-pair audio matching was patented in the early 2000s (US6990453,
US7627477, named in Panako's README). Both are probably expired, but **a
patent attorney has to confirm this**, including European equivalents, before
paying customers rely on it (`RELEASE_CHECKLIST.md`).
