# Data flows

Where personal data goes, which service sees it, and what that means for the
privacy policy and the contracts. Written 2026-10-05 from the code, not from the
providers' contracts: the "to check" column is for the lawyer and the owner.
This is an engineering inventory, not legal advice.

## What RightsWatch holds

| Data | Whose | Where | Why |
|---|---|---|---|
| Email, name, password hash (scrypt), role | Team members (customers' staff) | Postgres (Neon) | Login, roles |
| Session rows (hashed id, expiry) | Team members | Postgres | Logout, revocation. Valid 7 days |
| Workspace name, plan, subscription status | The customer | Postgres, Stripe | Accounts, billing |
| Creators: TikTok username, display name, profile link, country, follower count | Creators (third parties, public data) | Postgres | The watchlist |
| Posts: date, brand names, label, video link, territory, matched song | Creators (public data) | Postgres | Detections |
| Songs, rights records, cases, notes, activity log | The customer | Postgres | The product |
| Request logs (IP address, URL, time) | Visitors, members | Vercel (platform logs) | Operation, abuse defence |

Not held: card numbers (Stripe), uploaded files (there are no uploads),
analytics or advertising identifiers (none), keystroke or session recordings
(none). The only cookie is the session cookie, which the login needs.

## Who receives what

| Service | What it receives | When | Notes / to check |
|---|---|---|---|
| **Vercel** (hosting, logs) | Every request: IP address, URL, headers. All data passes through its functions | Always | Functions run in `iad1` (US East). Moving them to `fra1` keeps processing in the EU (step "Neon region" in `RELEASE_CHECKLIST.md`). Data processing agreement (DPA) and transfer mechanism to confirm |
| **Neon** (Postgres) | All stored data | Always | Region still to be named by the owner. DPA to confirm. Backups: see `BACKUP_RESTORE.md` |
| **Stripe** | Customer email, workspace id, plan; card data goes to Stripe directly | Once Stripe is on | Own controller for payment data. Webhook logs here hold ids only |
| **Resend** (email) | Recipient address and the text of reset and confirmation emails | Once configured | Nothing is sent today. DPA to confirm |
| **TikTok** Commercial Content API | The creator usernames on a watchlist | Each scan, once keys exist | Terms for commercial monitoring and storing the data are an open question (checklist) |
| **AudD** | The video link of each post to identify; AudD downloads the video from TikTok | Each scan, once the token exists | At most 200 posts per scan (`AUDD_MAX_POSTS_PER_SCAN`), https links only. AudD's terms and its data handling to check; the creators' videos are third-party content |
| **MusicBrainz** | The text a member types into song search, sent by our server (not the member's browser) | Song search | Public data service. Searches are not linked to a member on their side |
| **Cover Art Archive** (Internet Archive) | A release id | Cover art | Fetched by our server, so no member IP address goes there |

Never sent anywhere: member passwords, session cookies, rights records and
cases (they stay in Postgres).

**No AI or language-model feature exists.** No customer text is sent to an AI
provider, and no model reads TikTok or AudD output. If one is added: list the
provider here first, sign a DPA, switch off training on customer data, keep
untrusted text (creator names, brand names, notes) away from any model that can
take actions, and tell people they are talking to an AI (AI Act, Art. 50).

## Roles under GDPR (to confirm with the lawyer)

- For its customers' workspaces (creators, posts, cases) RightsWatch most likely
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
| Deletion of one member's account | **Not self-service yet.** Handled by hand on request, within one month; the owner can also remove the whole workspace. To build before many customers: an "Delete my account" button for non-owners |
| Deletion of a creator's data | Removing a creator takes them off the watchlist; their posts stay in the history. A creator who asks to be erased is handled by hand through the customer (controller) |
| Correction | Members edit creators, songs and rights records in the product |

Deleted data stays in the database provider's backups until their history
window passes (see `BACKUP_RESTORE.md`); say so in the privacy policy.

## Keeping this file true

Whenever a feature sends data to a new service, add a row here **before** it
ships, and add the service to the privacy policy.
