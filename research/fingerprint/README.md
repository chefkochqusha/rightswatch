# Own song recognition: feasibility test (round 1)

Question: can RightsWatch identify its customers' songs in TikTok audio itself,
without a paid recognition service (AudD)? Date: 2026-10-08. Prototype only;
nothing here runs in the product.

## Idea

We don't need to recognise every song in the world, only the songs in a
customer's own catalogue. The customer uploads their recordings; we store an
acoustic fingerprint of each; every post's audio is compared against those
fingerprints only.

## What was built (`fp.py`)

Own implementation in Python (numpy/scipy), so no third-party licence applies:

- Spectrogram on a **log-frequency** scale (quarter tones), so a pitch shift
  is a plain shift of the frequency axis.
- **Tonal content only** (harmonic/percussive separation): drums are removed
  before analysis, because songs built from the same drum samples otherwise
  look alike.
- Landmark pairs of spectral peaks as hashes, plus an offset vote per song.
- The query is tried under a small grid of transforms on its peaks, without
  re-analysing the audio:
  - speed 0.78–1.32 × with the pitch following, as when a track is sped up or slowed;
  - speed with the pitch kept;
  - pitch alone, ±4 semitones.
- Rarity weighting: hashes many songs share count less.

## Test set (`synth.py`, `bench.py`)

No real music could be downloaded in the development environment (the network
policy blocks audio sites), so round 1 uses **procedurally composed songs**
(drums, bass, chords, melody, random key, tempo and timbre). Many share the same
chord progressions on purpose. Each catalogue song was queried with a **10-second
clip** under TikTok-style edits; songs not in the catalogue were queried to
measure false matches.

## Results (40 songs in the catalogue, 10-second clips)

Share of clips where the right song came out on top (measured before the rarity
weighting was added; a 12-song run with it showed the same picture):

| Edit | Correct song on top |
|---|---|
| Clean | 100 % |
| AAC 64 kbit/s (TikTok-like compression) | 100 % |
| Phone speaker + room echo | 100 % |
| Tempo 1.2× / 0.85×, pitch kept | 100 % / 97.5 % |
| Pitch +2 / −3 semitones | 97.5 % / 100 % |
| Sped up 1.15× / 1.25× (pitch up) | 97.5 % / 90 % |
| Slowed 0.85× (pitch down) | 97.5 % |
| Noise at 10 dB / 0 dB below the music | 90 % / 52.5 % |
| Voice over, music 6 dB / 12 dB under the voice | 92.5 % / 75 % |
| Worst case: sped up 1.2× + voice + phone + AAC | 32.5 % |

About 1.3–2.8 s per clip in pure Python on one core (a compiled version
would be many times faster). The cost per post is a few CPU seconds on our own
server, against about 0.5 cents per post at AudD.

## What is not solved yet

1. **Saying "not in your catalogue" reliably.** On the synthetic songs, a
   song that shares arrangement, key and chord progression with a catalogue
   song can score as high as a real match, so no safe threshold could be set.
   Synthetic songs are far more alike than real recordings (identical voicings,
   instruments, drums), so this has to be measured on real music. Product-wise,
   a borderline score becomes "needs review", which the product already has.
2. **Heavy voice-over and the combined worst case.** Next steps: longer clips
   (whole posts are 15–60 s, not 10 s), several windows per post, and a second
   check stage that compares the melody line over the matched section.
3. **Speed** of the prototype; to be ported to compiled code with a proper
   index once the method is settled.

## Licences and patents

- This code: our own.
- Existing open-source alternatives: Panako is AGPL-3.0, which is a problem for
  a hosted service unless we publish our code. Chromaprint's source is MIT plus
  LGPL, but it is built for full tracks, not short clips. Panako's README warns
  of patents US6990453 and US7627477 (landmark-style audio matching). Both were
  filed in the early 2000s and are probably expired, but **a patent attorney
  has to confirm this** (including European equivalents) before the method
  ships.

## Round 2: needed from the owner

- 20–50 real songs (MP3/WAV), ideally from the genres customers will have.
- 5–10 real TikTok posts that use some of them (sped-up versions, voice-over),
  saved by the owner.
- Legal: can post audio be fetched for analysis under TikTok's terms?

Run: `python3 bench.py <catalogue songs> <negative songs> <clip seconds>`
(needs `numpy`, `scipy`, `soundfile`, and `ffmpeg` with rubberband).
