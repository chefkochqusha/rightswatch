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
                     │  PUT  /index/<ws>   (when changed) → index kept in memory here
                     │  POST /match/<ws>   (a post)       → candidates → decision (app)
                     ▼
                  recognizer (this service, private network only)
```

- **Keeps nothing.** Fingerprints live in Postgres (so the nightly backup
  covers them); this service holds a few workspaces' indexes in memory and is
  sent a new one when the catalogue's version changes. Uploaded audio is
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

## Run and test

```bash
python3 -m unittest discover -s services/recognizer -p "test_*.py"   # 12 tests
RECOGNIZER_TOKEN=dev PORT=8090 python3 services/recognizer/server.py
```

Needs `ffmpeg`, numpy and scipy (`requirements.txt`). In production it runs
from `Dockerfile` as the `recognizer` service in `deploy/compose.yml`.

## Patents

Landmark-pair audio matching was patented in the early 2000s (US6990453,
US7627477, named in Panako's README). Both are probably expired, but **a
patent attorney has to confirm this**, including European equivalents, before
paying customers rely on it (`RELEASE_CHECKLIST.md`).
