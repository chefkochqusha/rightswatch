# Stage 2: a learned fingerprint (status 2026-10-11)

Goal: find music that is quiet under speech, heavily edited or re-recorded, where
the landmark method (stage 1) only gives a suggestion.

## Licence check (looked up 2026-10-11, not from memory)

| Model | Code | Weights | Usable commercially? |
|---|---|---|---|
| MERT (m-a-p/MERT-v2-30s) | not stated on the page | CC BY-NC 4.0 | No |
| MuQ / MuQ-MuLan | MIT | CC BY-NC 4.0 | Code yes, weights no |
| neural-audio-fp (mimbres) | MIT (earlier research) | no weights we may rely on | Code yes, must train ourselves |
| audfprint | MIT | none needed | Yes (stage 1 is our own code anyway) |

Sources: https://huggingface.co/m-a-p/MERT-v2-30s and https://pypi.org/project/muq

Consequence: **no pretrained NC backbone goes into the product.** Any learned
stage must be trained by us on music we have the right to use for training.
The lawyer question "training on music" (todo 8) decides what data is allowed.

## What this means for the plan

1. Stage 1 stays the product. It is our own code and has no licence risk.
2. Stage 2 = own small contrastive model (neural-audio-fp architecture, MIT code),
   trained from scratch on rights-cleared music with speech/noise/speed augmentation.
3. Needs: GPU (rented, 11+ GB for the reference setup), training music with rights,
   a lawyer's answer on training use. None of this exists yet, so no prototype
   was built: a CPU toy trained on a few songs would say nothing about real quality.
4. Decision gate: only start once the real-catalogue test (todo 14) shows which cases
   stage 1 misses in practice.
5. Patent check (todo 9) applies to stage 2 as well.
