# Data flows

Where personal data goes, which service sees it, and what that means for the
privacy policy and the contracts. Written 2026-10-05 from the code, not from the
providers' contracts: the "to check" column is for the lawyer and the owner.
This is an engineering inventory, not legal advice.

## What Bekvor holds

| Data | Whose | Where | Why |
|---|---|---|---|
| Email, name, password hash (scrypt), role | Team members (customers' staff) | Postgres (Neon) | Login, roles |
| Session rows (hashed id, expiry) | Team members | Postgres | Logout, revocation. Valid 7 days |
| Workspace name, plan, subscription status | The customer | Postgres, Stripe | Accounts, billing |
| Company name, billing address, VAT ID and its VIES result | The customer (a business; a sole trader's name is personal data) | Postgres (`billing_profiles`), Stripe customer | Invoices (§ 14 UStG), the B2B check; Stripe asks VIES about EU VAT IDs |
| Creators: TikTok username, display name, profile link, country, follower count | Creators (third parties, public data) | Postgres | The watchlist |
| Posts: date, brand names, label, video link, territory, matched song | Creators (public data) | Postgres | Detections |
| Songs, rights records, cases, notes, activity log | The customer | Postgres | The product |
| Rate-limit counters: an HMAC of the email + IP address or the IP address, failure count, block time | Visitors, members | Postgres (`rate_limits`), on Vercel only | Brute-force and abuse defence. Not reversible without `SESSION_SECRET`; rows untouched for a day are removed |
| Request logs (IP address, URL, time) | Visitors, members | Vercel (platform logs) | Operation, abuse defence |
| Partner code, which workspaces signed up through it, commissions (amount, invoice id, payout date) | Partners (members who joined the programme) | Postgres | Partner programme payouts and bookkeeping |
| Song fingerprints (landmark hashes, not playable), file name, length | The customer | Postgres | Own song recognition (our own server only) |
| Uploaded song recordings and post videos/sounds | The customer; post videos show creators (face, voice) | Upload disk on our own server (`UPLOAD_DIR`), **only until read**: deleted after the fingerprint or the check, at the latest after 24 hours | Own song recognition |
| Audio-check results (song, match strength, the service's scores) | The customer | Postgres | Suggestions on the post, audit trail |

Not held: card numbers (Stripe), uploaded files after they are read,
analytics or advertising identifiers (none), keystroke or session recordings
(none). The only cookie is the session cookie, which the login needs.

## Who receives what

| Service | What it receives | When | Notes / to check |
|---|---|---|---|
| **Vercel** (hosting, logs) | Every request: IP address, URL, headers. All data passes through its functions | Always | A US company. Functions run in `iad1` (US East); `fra1` (Frankfurt) keeps processing in the EU but does not change who operates the service (step "Neon region" in `RELEASE_CHECKLIST.md`). Vercel states it is certified under the EU-US Data Privacy Framework; DPA to sign. Needs the **Pro plan** for commercial use |
| **Neon** (Postgres) | All stored data | Always | Region still to be named by the owner. DPA to confirm. Backups: see `BACKUP_RESTORE.md` |
| **Stripe** | Customer email, workspace id, plan; card data goes to Stripe directly | Once Stripe is on | Own controller for payment data. Webhook logs here hold ids only |
| **Resend** (email) | Recipient address and the text of reset and confirmation emails | Once configured | Nothing is sent today. DPA to confirm |
| **TikTok** Commercial Content API | The creator usernames on a watchlist | Each scan, once keys exist | Terms for commercial monitoring and storing the data are an open question (checklist) |
| **Recognition service** (`services/recognizer`, our own) | Uploaded audio, a workspace's fingerprints | Each upload | Runs on our own server on the private network; keeps nothing on disk. Not a third party |
| **MusicBrainz** | The text a member types into song search, sent by our server (not the member's browser) | Song search | Public data service. Searches are not linked to a member on their side |
| **Cover Art Archive** (Internet Archive) | A release id | Cover art | Fetched by our server, so no member IP address goes there |

Never sent anywhere: member passwords, session cookies, rights records and
cases (they stay in Postgres).

**No AI or language-model feature exists.** No customer text is sent to an AI
provider, and no model reads TikTok output. If one is added: list the
provider here first, sign a DPA, switch off training on customer data, keep
untrusted text (creator names, brand names, notes) away from any model that can
take actions, and tell people they are talking to an AI (AI Act, Art. 50).

## Transfers to the US (Vercel, Stripe, Resend, Neon)

Two separate things are often mixed up (the reel comments about Vercel and
Cloudflare do this):

1. **A data processing agreement (AVV / DPA, Art. 28)** regulates what the
   provider may do with the data. Every provider above needs one.
2. **A transfer mechanism (Chapter V)** is what makes sending data to a US
   company lawful at all: an adequacy decision (the EU-US Data Privacy
   Framework, DPF, in force since July 2023, for companies certified under it) or
   Standard Contractual Clauses.

An AVV does not replace the second; the second does not replace the first. Both
are needed. As far as checked on 2026-10-06:

- Vercel says it is certified under the DPF (its guide, last updated 2025-11-10).
  It does not matter whether the function region is Frankfurt: the operator is
  still a US company, which is why a lawyer may still ask for the clauses too.
- The DPF stands, but is under appeal: the EU General Court upheld it on
  3 September 2025 and the challenger appealed to the Court of Justice on
  31 October 2025. I could not confirm a decision after that. If the DPF falls,
  every US provider on this list needs standard clauses instead; keep that in
  mind when choosing providers and ask each one for them now.
- "Only a plain website, so no problem" is not right either: a visitor's IP
  address is personal data even without a contact form (that was the point of
  the Google Fonts ruling), so the privacy policy must name Vercel regardless.
- Cloudflare is not used here.
- EU-only hosting (a provider with an EU seat) removes the question, but
  costs a rebuild of the deploy pipeline. Not planned: ask the lawyer whether
  Vercel with DPF, a DPA and the Frankfurt region is acceptable for this product.

## Roles under GDPR (to confirm with the lawyer)

- For its customers' workspaces (creators, posts, cases) Bekvor most likely
  acts as a **processor**: it needs a data processing agreement (AVV, Art. 28)
  with every customer, and the list above is its sub-processor list.
- For accounts, billing and its own website it is the **controller**.
- A processor must tell the controller about a breach "without undue delay"
  (Art. 33(2)); see `INCIDENT_RESPONSE.md`.

## Rights of the people concerned

| Request | How it is handled today |
|---|---|
| Access, portability | Settings → "Download your data": owners and admins get the whole workspace as JSON, every member gets their own account data. Each download is in the activity log |
| Deletion of a workspace | Settings → "Delete workspace" (owner): removes the workspace, all its data and every member's account |
| Deletion of one member's account | Settings → "Delete my account" (every member except the owner, with their password), or an owner or admin removes them on the Team page (their login is erased; also ends their sessions). Notes and activity stay with the workspace without the name. An owner first hands the workspace to an admin (Team → "Hand over the workspace", with their password) or deletes the workspace |
| Deletion of a creator's data | Removing a creator takes them off the watchlist; their posts stay in the history. A creator who asks to be erased is handled by hand through the customer (controller) |
| Correction | Members edit creators, songs and rights records in the product |

Deleted data stays in the database provider's backups until their history
window passes (see `BACKUP_RESTORE.md`); say so in the privacy policy.

## Keeping this file true

Whenever a feature sends data to a new service, add a row here **before** it
ships, and add the service to the privacy policy: the page
(`src/app/(site)/privacy/page.tsx`), its German draft
(`legal/datenschutzerklaerung.md`) and, for customer data, the AVV's
sub-processor annex (`legal/avv.md`, Annex C).
