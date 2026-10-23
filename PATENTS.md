# Patents around Bekvor's song recognition: a first look

Researched 2026-10-23 for the patent attorney. **Not a freedom-to-operate
opinion.** Patent status below is what Google Patents shows, which Google
itself calls "an assumption, not a legal conclusion"; the attorney checks the
registers (USPTO, EPO, DPMA). Bekvor is sold from Germany, so the German and
European rights count first; US rights matter for US customers or a US server.

## What Bekvor's recognition does (`services/recognizer/`)

1. Spectral peaks ("landmarks") are paired, and each pair is hashed from the
   two frequencies and their time difference.
2. A match is a pile-up of equal time offsets between a post's pairs and a
   song's pairs (a histogram of relative values).
3. Speed and pitch changes are handled by trying a grid of speed and pitch
   transforms of the post, guided by a shortlist that votes on speed bins.
4. A shortlist of large catalogues uses keys built from three peaks.
5. A melody check compares pitch contours before an automatic match.

## The families that cover the old core, and their status

| Family | What it claims (short) | Earliest priority | Status (Google Patents) |
|---|---|---|---|
| Shazam, Wang & Smith: US 6,990,453 "Recognizing sound and music signals in high noise and distortion", continuations US 7,346,512 … US 10,497,378; EP 1307833 | Landmark pairs, hashes, offset histogram (steps 1 and 2) | 31.07.2000 | US 6,990,453 expired 07.01.2024; continuation US 9,401,154 expired 27.10.2021. EP filed 26.07.2001, so 20 years ended 26.07.2021 at the latest |
| Shazam, Wang & Culbert: US 7,627,477 "Robust and invariant audio pattern matching"; EP 1504445 (DE 60323086) | Relative values of matched fingerprints in a histogram; dependent claims on speed and pitch invariance (frequency ratios, time-difference ratios, relative playback speed) — close to step 3 | 25.04.2002 | US expired 31.03.2025. EP from PCT filed 18.04.2003, so 20 years ended 18.04.2023 at the latest |
| Philips, Haitsma & Kalker: US 7,549,052 / US 7,921,296 "Generating and matching hashes of multimedia content" | Robust frame-energy hashes (a different method; Bekvor doesn't use it) | 12.02.2001 | US 7,549,052 expired 06.07.2024 |
| Predixis / Gracenote: US 7,013,301 "Audio fingerprinting system and method" | SVD-based fingerprints for recommendations (different method) | 23.09.2003 | Expired 23.01.2024 |

So the classic landmark method and the 2002 invariance patent look free now.

## Still to check (newer ideas, possibly still protected)

- **Keys from three or four peaks that survive speed and pitch changes**
  (step 4). The idea is published academically: Sonnleitner & Widmer,
  "Quad-based audio fingerprinting robust to time and frequency scaling",
  DAFx 2014 and IEEE/ACM TASLP 2016 (JKU Linz). Whether the authors, JKU or a
  company filed a patent on it was not found here.
- **Speed-guided search** (step 3 with a shortlist that votes on speed bins)
  and the **second, denser pass**. These are Bekvor's own engineering. Newer
  patents by Shazam/Apple, Gracenote/Nielsen, Audible Magic, ACRCloud or
  Google could claim something similar after 2005.
- **Melody or pitch-contour checks** after a fingerprint match (step 5).

## Ask the attorney for

1. A freedom-to-operate search for Germany and the EU (and the US, if US
   customers come), limited to steps 3 to 5 and to families filed from 2006 on.
2. Confirmation that the families in the table have expired in DE and the EU,
   including any extended or divisional parts.
3. Whether publishing the method (this repository's README, a blog post)
   makes sense as prior art against later patents by others.

## Sources

- US 6,990,453: https://patents.google.com/patent/US6990453B2
- US 9,401,154 (same family): https://patents.google.com/patent/US9401154
- EP 1307833 (priority and filing dates): https://data.epo.org/publication-server/rest/v1.2/patents/EP1307833NWA2/document.html
- US 7,627,477: https://patents.google.com/patent/US7627477
- EP 1504445 (filing data, DE 60323086): https://data.epo.org/gpi/EP1504445B1
- US 7,549,052: https://patents.google.com/patent/US7549052B2
- US 7,013,301: https://patents.google.com/patent/US7013301
- Sonnleitner & Widmer, quad-based fingerprinting (DAFx 2014): https://www.dafx14.fau.de/papers/dafx14_reinhard_sonnleitner_quad_based_audio_fingerpr.pdf
