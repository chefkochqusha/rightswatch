# TikTok Commercial Content API: the application

Checked 2026-10-13 against TikTok's own pages (sources at the end). The form
itself is only visible after logging in, so the texts below are written to
fit the usual questions (organisation, use case, data use); adjust them to
the form's fields.

## How access works

1. Create a **TikTok for Developers** account with an **official email
   address** (TikTok asks for it; use `…@bekvor.com`, not Gmail).
2. Fill in the form at `developers.tiktok.com/application/commercial-content-api`.
   TikTok says: "You should hear back from us within 2 working days of
   submitting your complete application." Questions come from
   `commercial-research-questions@tiktok.com`.
3. If approved, the client key and secret are in the developer account:
   `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` (`RELEASE_CHECKLIST.md`).

A question sent to that address on 2026-09-28 (still as "RightsWatch") got no
answer by 2026-10-13. A follow-up with the new name is waiting as a draft in
the owner's Gmail.

## What the API gives, and what it doesn't

- Data from **Europe only** for now; TikTok plans more countries.
- Commercial content (ads and posts marked as commercial): id, dates, label,
  brand names, creator, video links. That is what
  `src/modules/connectors/tiktok/commercial-content-connector.ts` asks for.
- **No audio and no music information.** The song in a post still has to
  come from somewhere else: today a person uploads the post's video or sound
  (own recognition), or says which song it is.
- TikTok's pages describe the API for "the public and researchers" and don't
  say whether a paid product may use it. **That is the open question**, for
  TikTok and for the lawyer, before anything is built on it commercially.

## Texts for the form (English, honest, adjust to the fields)

**Organisation.** Bekvor (bekvor.com), a software product being set up by
Lennart Schwanke in Germany. (Only once the business is registered; until
then say plainly that it is in preparation.)

**What the product does.** Bekvor helps music publishers and licensing
agencies keep track of where their songs are used in commercial creator
content. A customer lists the creators they work with; Bekvor shows which
of those creators' commercial posts (paid partnerships, ads) exist, so the
customer can check whether the music used in them is licensed for that use.
Bekvor never makes a legal judgement and never contacts creators; the
customer reviews every result.

**Why the Commercial Content API.** It is TikTok's official, transparent
source for which content is marked as commercial. We only query the
usernames a customer has added, only for commercial content, and only the
fields we need (id, dates, label, brand names, creator, video link).

**Data handling.** Bekvor will run on its own server in the EU (the
current test deployment is on Vercel, which processes in the US; say so if
asked before the move, `DATA_FLOWS.md`). Results are visible only to the
customer's own workspace. A creator removed from a customer's list is not
queried again. No data is sold, shared with third parties or used to
profile people; nothing is used to train models. Customers can export and
delete their data (GDPR).

**Volume.** A few hundred creators per customer, queried at most daily;
well within the documented page size of 50 results.

**Question to ask in the form (if there is a free-text field).** Is use by a
paid B2B service on behalf of rights holders within the API's terms? If not,
which official channel fits this use case?

## If TikTok says no

The product still works without the API: a customer adds posts by link and
uploads the post's video or sound, and the own recognition checks it. That
is slower for customers, so the answer decides how Bekvor is sold, not
whether it works.

## Sources

- https://developers.tiktok.com/products/commercial-content-api
- https://newsroom.tiktok.com/en-eu/expanding-tiktoks-research-api-and-commercial-content-library (2023-07-20)
