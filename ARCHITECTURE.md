# RightsWatch — Architecture

## What this document is

This is the document `prisma/schema.prisma`'s own header calls "the source of
truth for entities," and that dozens of doc comments across `src/modules/*`
and `src/app/_lib/*` point to for "Open decisions," "Connector architecture"
and "Database architecture." It didn't exist on disk until now, even though
it's been cited by name since early in this project.

Nothing below is a new decision. This document consolidates decisions that
were already made and already implemented, gathered from the comments that
already cite it. Where a decision traces to the PROJECT MASTER BRIEF, it's
cited the same way the code already does — "Brief §N." Where a decision was
made in this project's own working sessions and never appears in the Brief
(the Postgres host, for instance), it's stated plainly as a standing project
decision, with no citation invented to dress it up as something the Brief
said.

Read this alongside `DESIGN_SYSTEM.md` (UI/visual conventions) and
`prisma/schema.prisma` itself, which stays the literal, field-level source of
truth — this document describes its shape and status, and deliberately never
restates a full field list that could drift out of sync with it.

## What RightsWatch is

(Brief §1) RightsWatch is a B2B SaaS product for music publishers and labels
that detects unlicensed commercial (paid-partnership / "#ad") use of their
catalog by TikTok creators. A publisher's workspace scans commercial content
set to licensed music, checks it against the rights the publisher actually
holds — territory, license term, commercial-vs-organic usage, campaign scope
— and surfaces anything that doesn't clearly clear as a Case for a human to
review. It is explicitly a workflow-signal tool, not a legal-determination
tool (Brief §11, §16): its verdicts are inputs to a human decision, never a
finding of infringement.

Two mandates shape the project from outside any single file. It is one
modular Next.js application, not a monorepo or a set of independently
deployed services — reflected in there being exactly one `package.json` and
one `src/` tree, with domain separation enforced by module boundaries (see
below), not by repository boundaries. And it targets desktop/MacBook users
in a browser, not a mobile app — stated explicitly in `globals.css`'s own
typography comment ("real SF Pro for the MacBook-using customer the product
targets").

## Tech stack

| Layer | Choice | Status |
|---|---|---|
| Framework | Next.js 16 (App Router; `proxy.ts`, not `middleware.ts` — renamed in Next.js 16, see `AGENTS.md`) | Built |
| UI | React 19, Tailwind CSS v4 | Built |
| Language | TypeScript | Built |
| Validation | Zod | Built (where used) |
| ORM | Prisma (`prisma/schema.prisma`) | Schema complete; generated and pushed to Neon on every Vercel build, and verifiable locally against a real Postgres — see "Open decisions" and "Testing & verification conventions" |
| Database | PostgreSQL, hosted on Neon | Provisioned and live (Vercel marketplace integration) — see "Open decisions" |
| Background jobs | BullMQ on Upstash Redis | Chosen, not wired — see "Open decisions" |
| Auth | Session-based, signed cookie (Brief §40) | Built, Prisma-backed (Neon) |
| Payments | Stripe (test mode) | Built; turns on once its five env vars are set (`STRIPE_INTEGRATION.md`) — production runs clearly-labeled demo billing (`MockPaymentProvider`) until then |
| Hosting | Vercel (production deploys from `main`) | Live |
| Testing | Node's built-in test runner via `tsx --test` | Built — one `*.test.ts` per implementation file |

## Open decisions

This is where a choice this project had to make — because the Brief names an
entity or a requirement without naming a vendor — gets recorded, so it's
made once and referenced everywhere rather than re-litigated per file.

### Data layer

- **Prisma, not Drizzle**, is the chosen ORM. A standing project decision:
  the Brief specifies entities and domain boundaries (§43) but not an ORM.
- **PostgreSQL hosted on Neon** — not Supabase, not a self-managed AWS RDS
  instance. Also a standing project decision, made to fit a single modular,
  serverless-friendly Next.js app rather than cited from the Brief.
- **Schema sync:** `prisma db push` on every Vercel build (package.json's
  `build`), not versioned `migrate` files. A push that would lose data
  stops the build instead of applying, so every schema change is pushed to
  a local Postgres first (`npm run db:local:push`), where the same warnings
  show up before deploying.
- **Local Postgres, despite the sandbox:** the build sandbox can't download
  Prisma's native schema-engine binary (binaries.prisma.sh isn't reachable),
  but nothing else needs the network. `prisma generate` never runs that
  engine — pointed at any executable via `PRISMA_SCHEMA_ENGINE_BINARY`, it
  generates the real client; `prisma dev` runs a local Postgres; and
  `scripts/local-db/push-schema.mjs` pushes the schema with Prisma's own
  WebAssembly build of the engine. So Prisma writes, constraints and foreign
  keys are exercised for real before a deploy — what would have caught the
  `cases` regression below. Only Neon itself is out of reach from here.
- **Six repository domains are Prisma-backed and live.** Four were
  verified against production Neon with a real signup → dashboard → logout
  → login round-trip, not just a successful build: `auth`
  (`User`/`Workspace`/`Membership`), `billing` (`Plan`/`Subscription`),
  `notifications` (`Notification`), and `audit` (`AuditLog`). The rest —
  `auth`'s `Session`, `scan-results` (the scan pipeline's `Creator →
  Content → CommercialContent → MusicMatch → RightsAssessment` chain, plus
  `MusicTrack`) and `cases` (`Case`/`CaseNote`) — were verified end to end
  against a local Postgres carrying the real schema, constraints and
  foreign keys, then deployed.
- **Why `cases` came last.** `Case.rightsAssessmentId` is a foreign key to
  `RightsAssessment.id`. A first attempt (6b69b95) pointed `case-store.ts`
  at Postgres while assessments still lived in process memory under a
  synthetic `workspaceId::contentId` id, and every "Run a sample scan" and
  "Open a case" failed with a foreign-key violation in production until it
  was reverted. Cases moved to Postgres only together with
  `modules/scan-results`, which writes the rows they point at. Recorded
  here on purpose: a repository swap is only a drop-in if every foreign key
  its rows carry points at rows something actually writes — check the
  schema's relations, not just the interface's shape.
- **Nothing user-visible lives in process memory any more.** The one
  remaining in-memory piece is the login rate limiters (see "Auth &
  authorization"), which hold per serverless instance rather than globally.
  What the scan *reads* is still fixtures — `MockTikTokConnector`,
  `FixtureMusicIdentificationProvider`, `FixtureRightsRepository`,
  `FixtureCampaignRepository` — kept field-compatible with the Prisma
  schema until the features below replace them; what it *writes* is real.
- **Rights, creators and campaigns are workspace data the Brief has users
  manage, not reference data synced from elsewhere.** An earlier version
  of this document said the opposite, after reading only the start of the
  Brief: §10 calls the Rights Library "one of the most important product
  areas" (structured per-track rights a workspace maintains), and §8 makes
  creators first-class records users add, pause, resume and assign to
  campaigns. Creators are built (`modules/creators`, see "Creator
  management"); rights records and campaigns still come from the demo
  dataset until the Rights Library replaces them. `Connector`/
  `ConnectorCredential` arrive with the real TikTok connector, which is
  what has something to store in them.
- **`getPrisma()`, never a top-level `prisma` constant**
  (`src/lib/prisma-client.ts`): the generated client, its driver adapter, and
  the `pg` pool all load via a `require()` deferred until `getPrisma()`
  actually runs, not a top-level `import`. This isn't a style choice — a
  top-level *value* import of anything from the generated client crashes at
  module-load time in this sandbox for any file sharing an import graph with
  a Prisma repository, even code that never touches Prisma itself (found via
  two real test regressions while wiring the four modules above). Every
  Prisma-backed repository, current and future, follows this pattern.

### Background jobs

- **BullMQ, backed by Upstash Redis.** BullMQ and its durable `Job` audit
  row are Brief §21; Upstash specifically is a standing project decision
  (pairing naturally with Neon's serverless-first hosting story), not a
  Brief citation.
- **Current reality:** nothing is queued yet. A scan runs synchronously,
  in-process, triggered by a Server Action ("Run scan") rather than a
  scheduled job — but every run is already recorded as a `Job` row
  (`modules/jobs`): created `RUNNING` when it starts, `COMPLETED` or
  `FAILED` when it ends, with per-creator results as its payload. That row
  is what a creator's monitoring history (§8) reads, and what a queue will
  pick up and retry once there is one. `Job.workspaceId` is an addition to
  §21's field list, documented on the model: a scan always works for one
  workspace. (`WebhookEvent`, the other operations table, is live — see
  "Payments".)
- **Scheduled scans** don't need the queue. `vercel.json` has a daily cron
  (04:30 UTC, the only frequency Vercel's free plan allows) calling
  `/api/cron/scans`, which refuses everything unless the request carries
  `Authorization: Bearer <CRON_SECRET>` (and refuses all of it while the
  variable is unset). `runDueScans` (`app/_lib/scheduled-scans.ts`) asks
  `modules/jobs/due-scans.ts` to scan each workspace whose plan cadence says
  it's due — "daily" counts as due after 20 hours and "every_6h" after 5, so a
  run that started a few minutes late yesterday still counts today;
  "configurable" runs daily until it has a setting. A workspace's failing scan
  doesn't stop the others, a failed run doesn't postpone the next try, and no
  new workspace starts after a 200 s budget. The scan is a normal `Job` with
  no triggering user, so the cases it opens are audit-logged without an actor.
  **It does nothing while the connector is the demo one**: demo scans produce
  invented posts, and a customer's workspace shouldn't be topped up with them
  on a timer. The Growth plan's six-hour cadence needs a more frequent
  trigger than the free Vercel plan allows; on that plan it runs daily.

### Object storage

Not decided. `.env.example`'s `STORAGE_*` variables are blank placeholders.
`CaseEvidence` (Brief §43) is modeled in the schema but out of scope in
application code until a provider is chosen.

### Email

`modules/email` defines an `EmailSender` with two implementations:
`OutboxEmailSender` (keeps messages in memory; the default) and
`ResendEmailSender`, chosen only when both `RESEND_API_KEY` and `EMAIL_FROM`
are set (`app/_lib/email.ts`). Links in an email take their origin from
`APP_URL` / `VERCEL_PROJECT_PRODUCTION_URL` in production, never from the
request's Host header. Password reset and email confirmation send email. Invite links
are still shown in-app for the inviter to copy, and in-app notifications
are the only notification channel (see "Notifications" below). A
domain-verified sender address is part of `RELEASE_CHECKLIST.md`.

**Deleting a workspace (GDPR Art. 17).** Settings has a "Delete workspace"
card for the owner (never in the public demo): the workspace's name typed out
plus the owner's password, 5 password guesses per 15 minutes.
`modules/auth/delete-workspace.ts` checks that, runs `beforeDelete` (the app
passes "cancel the subscription"; if that throws nothing is deleted), then
`AccountRepository.deleteWorkspace`: in one transaction the workspace row goes
(the schema's cascades take creators, posts, matches, rights, cases, notes,
the audit log, notifications and the subscription record with it) and then
every account left without a workspace (sessions cascade). An account that
also belongs to another workspace stays. It isn't a soft delete and there is
no undo. Data held by processors (Stripe's invoices, Resend's logs) is theirs
to delete or keep by their own rules. Not built: automatic deletion of old
data, and a data export beyond the report CSV.

**Accessibility.** Checked with axe-core (WCAG 2.1 AA plus best practices) on
every public and app page in light and dark mode: no violations. What keeps it
that way: `--t2` and the accent/green tokens are tuned to 4.5:1 on every
surface they sit on, text on an accent fill uses `--acf` (white in light mode,
dark in dark mode, so a primary button needs `text-accent-fg`, never
`text-white`), every page has one `<main>`, banners are labelled `<aside>`s, links inside
running text carry an underline, and each layout starts with a "Skip to content" link.

**Search and sharing.** `app/robots.ts` and `app/sitemap.ts` expose the public
site only (landing, imprint, privacy); the app (the public demo included),
sign-in pages and `/api` are disallowed, and the workspace layout sets
`noindex`. `app/opengraph-image.tsx` renders the link preview. The origin comes
from `app/_lib/site-origin.ts` (`APP_URL`, then the Vercel production domain).

### Payments

Stripe, in test mode, per the Brief's billing plan (§18–20) — built, and
switched on by configuration alone. Setup and verification steps:
`STRIPE_INTEGRATION.md`.

- **Two backends, one interface** (`PaymentProvider`):
  `MockPaymentProvider` (demo billing, labeled as such on the billing page)
  and `StripePaymentProvider`. `app/_lib/billing-store.ts` picks from the
  environment — all five Stripe variables set → Stripe, anything missing →
  mock (`payment-provider-selection.ts`). All-or-nothing, because a secret
  key without the webhook secret would start subscriptions that then never
  hear about anything Stripe changes on its own.
- **Current reality: no Stripe account exists yet**, so production runs on
  demo billing and the webhook endpoint answers `503`.
- **Trials start without a card**, and end with the subscription cancelled
  (not dunned) if none was added — Stripe's `trial_settings.end_behavior:
  cancel`. Cards, invoices and cancellation live in Stripe's hosted
  Customer Portal (`stripe-billing-portal.ts`), not in custom UI.
- **The webhook** (`/api/webhooks/stripe` → `handle-stripe-webhook.ts`) is
  the only path by which Stripe-side changes reach the database (Brief
  §18). Signature-verified; each delivery recorded in `WebhookEvent` keyed
  on Stripe's event id, so a redelivery is processed once (Brief §22); each
  sync reads the subscription's *current* state from the Stripe API rather
  than the event's own copy, so out-of-order delivery can't roll a row
  back. The stored payload is a handful of ids and statuses — never the
  customer data a Stripe event carries (Brief §59).
- **`WebhookEvent` is Prisma-backed from day one**, not in-memory first
  like every other domain was: idempotency kept in one serverless
  instance's memory would let a redelivery to another instance be
  processed twice — the one thing the table exists to prevent. It has no
  foreign keys, so unlike `Case` (see "Data layer") it doesn't depend on
  anything else being persisted first.
- **Demo-era subscriptions** carry `cus_mock_…`/`sub_mock_…` ids Stripe has
  never seen. `RoutingPaymentProvider` keeps those on the mock (a plan
  change or cancel on one never calls Stripe), and
  `PaymentProvider.canReuseCustomer` makes the workspace's next subscribe
  after a cancel create a real Stripe customer — the path from demo to real
  billing, stated on the billing page.

### Monitoring

`SENTRY_DSN` is a placeholder in `.env.example`. Nothing reports to it yet.

## Module-layer architecture

Every domain lives under `src/modules/<domain>/`. With the deliberate
exception of `rights-engine` (a pure function with nothing to swap — see
"Rights engine"), every module that touches storage follows the same shape:

- **`types.ts`** — the module's own plain-data types, plus one or more
  repository/provider *interfaces*. The interface, never a concrete class,
  is what the rest of the app depends on.
- **An in-memory or fixture implementation** of each interface.
  `InMemory*Repository` mirrors a Prisma-backed one for data this app
  creates and mutates (users, cases, scan results, notifications), so
  business logic is unit-tested without a database;
  `Fixture*Repository`/`Fixture*Provider` serves fixed seed data (rights
  records, campaigns, music identification, TikTok content) where the real
  source isn't built yet. A fixture is a placeholder, not a statement about
  where that data lives: rights records and campaigns are workspace data
  users manage (Brief §10, §8), and the connector and music provider are
  external integrations.
- **Business-logic functions** (`sign-up.ts`, `open-case.ts`, `run-scan.ts`,
  `notify-case-opened.ts`, and so on) that take their dependencies as an
  explicit `deps` parameter typed to the interfaces above, never importing
  a concrete implementation themselves.
- **`index.ts`** — barrel exports.
- **A `*.test.ts` beside every implementation file.**

This has been the project's pattern since the first module was built
(`PlatformConnector` / `MockTikTokConnector`): swapping a fixture or
in-memory implementation for a real, Prisma-backed one is a change to one
file, or one call site's `new X()` — never a change to the business logic,
Server Actions, or pages that use it.

| Module | Domain | Brief citation |
|---|---|---|
| `auth` | Users, workspaces, memberships, sessions, roles, invites | §40, §43 |
| `connectors` | Platform adapter boundary (TikTok today; Instagram/YouTube named as future extension points) | §1–§5, §9, §44 |
| `music` | Music identification provider boundary | §1, §43 |
| `rights-engine` | Pure rights-assessment function — no storage, nothing to swap | §11, §43 |
| `catalog` | The song catalogue — the Rights Library's songs: add, take out, details; telling two descriptions of a song apart | §10, §43 |
| `catalog-search` | Finding a song to add by searching a music database (MusicBrainz) or the fixed demo catalogue | §10 |
| `rights` | A song's rights records: the form's validation, storage, and the Rights Engine's view of them (plus the demo dataset's fixture lookup) | §10, §42 |
| `campaigns` | A workspace's campaigns and who's on them; the scan's per-creator lookup | §2, §11 |
| `creators` | The watchlist: add, pause, resume, remove, edit; plan limits on monitoring | §8, §19 |
| `demo-data` | The fictional dataset every demo adapter reads: catalogue, creators, posts (see "Demo data") | §48, §62 |
| `scan-pipeline` | Wires connector → music ID → rights engine into one scan | §21, §50 |
| `scan-results` | Stores a scan's `Content → … → RightsAssessment` chain for a watchlist creator, idempotently | §22, §43, §50 |
| `jobs` | The durable record of every scan run, and its per-creator results | §21 |
| `cases` | Turns a flagged assessment into actionable, assignable work | §43 |
| `notifications` | In-app notifications for workspace members | schema only — not itself Brief-numbered |
| `billing` | Plans and subscriptions | §18–§20 |
| `audit` | Per-workspace audit trail of case-lifecycle events | schema only — not itself Brief-numbered |

## Connector architecture

(Brief §1–§5, §9, §44)

A connector is the only code in the system allowed to know a given
platform's raw API shape. `PlatformConnector` (`src/modules/connectors/`)
defines the one boundary everything downstream — music identification, the
rights engine, cases, the UI — reads through: a `NormalizedCommercialContent`
shape. `rawPayload` is carried through for audit display only; no business
logic anywhere is allowed to branch on it (Brief §1, §44).

`MockTikTokConnector` is the only implementation today. It's asked what the
real API is asked — a creator's username and a publication-date window
(Brief §4) — and answers from the demo dataset (see "Demo data" below) in
the real response's shape: `id`, `create_timestamp`, `create_date`,
`label`, `brand_names`, `creator`, `videos`, and notably no track title,
ISRC or audio, which is exactly why music identification is a separate
boundary rather than assumed to come from the platform. Like the real API,
it never returns a post from the future.

The real connector — `TikTokCommercialContentConnector`
(`modules/connectors/tiktok/commercial-content-connector.ts`) — is written
against TikTok's public documentation: a client-credentials token
(`/v2/oauth/token/`, renewed before its two hours end and once more on a 401),
then `POST /v2/research/adlib/commercial_content/query/` for one creator and a
date range, following the `search_id` cursor to the last page. It has **not**
run against the live service (that needs an approved TikTok application), only
against stubbed responses, so every failure — refused credentials, rate
limit, a bad answer, no network — comes back as a readable `error` on the
fetch, which the scan records per creator ("1 creator couldn't be fetched"),
never as "zero posts found". It returns no music and no territory: the API has
neither (Brief §4).

**What switches it on:** `getConnectorMode()` (`app/_lib/connector-mode.ts`) is
`REAL` only when both `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` are set and
`DEMO_MODE` isn't "true"; otherwise `DEMO`. `dataModeFor(workspace)` is the
per-workspace answer: the public demo workspace is always `DEMO`, so it keeps
its made-up posts however the app is configured. In `REAL` mode a scan uses the
real connector and the recognition provider `app/_lib/recognition.ts` picks:
`AuddRecognitionProvider` (`modules/music/audd-provider.ts`, each post's video
URLs sent to AudD in turn; no score from AudD, so a fixed 0.9; written against
the public docs and tested with a stubbed fetch) when `AUDD_API_TOKEN` is set,
else `NoRecognitionProvider`, so a real post is stored as "no song identified"
rather than given an invented one — the "Load demo data" and "Add the six demo creators" buttons disappear,
and the "Demo data" labels go.

`Connector` and `ConnectorCredential` exist in the Prisma schema
(workspace-scoped connection status, and credentials encrypted at rest per
Brief §44's secrets rule) but have no application code reading or writing
them yet — there's nothing to configure before Phase 10.

The same adapter shape is meant to extend to other platforms without
touching business logic: `FutureInstagramConnector`, `FutureYouTubeConnector`
(Brief §1). Neither exists — this is a named extension point, not built
scope.

Music identification (`src/modules/music/`) mirrors this exact boundary one
layer downstream: a `MusicIdentificationProvider` is the only code allowed
to know how a specific identification method (audio fingerprinting,
catalogue matching, or a human doing it manually) actually works, and
everything past it only ever sees `NormalizedMusicMatch`. Brief §1 names
four concrete implementations sharing this interface — ProviderA, ProviderB,
CatalogueMatchingProvider, and ManualMusicIdentification (the `manual:
boolean` flag on `NormalizedMusicMatch` exists for this last one).
`FixtureMusicIdentificationProvider` is the only one built today; it
answers from the demo dataset.

### Demo data

(Brief §48, §62)

`src/modules/demo-data/` is one coherent, fictional dataset the demo
adapters all read from: the catalogue (§62's six tracks and three brands,
two campaigns, the rights records on file — Golden Hour's is §10's own
example), §62's six named creators plus 42 more for §48's 48, and their
posts.

- **Scenarios.** Fifteen hand-written September 2026 posts by the six named
  creators, each there to produce one verdict: between them, every status
  and reason the Rights Engine gives commercial content, plus a post with
  no identifiable track and one whose identification fails.
  `demo-snapshot.test.ts` pins each verdict.
- **Generated posts** for any other username, so a creator a workspace adds
  itself is scanned like any other (§72 steps 5–9). Each creator posts at
  its own steady rate; post days, brands and identified tracks come from
  seeded draws, so the same username and window always give the same
  posts, with stable ids — a re-scan finds the same posts, never new
  copies of them.
- **Exactly §48's numbers.** Over Demo Mode's window (September 2026), the
  48 creators come to 186 videos, 27 music matches, 11 that need a
  decision and 7 new in the last week. `DEMO_SALT` is the seed that lands
  there; `computeDemoSnapshot()` checks it through the real `runScan()`
  in a test, and `scripts/demo-data/find-salt.ts` finds a new seed when a
  change to the dataset moves the numbers.

A creator's country (Brief §8) is the territory signal for a post the
platform reports none for — every TikTok post — and the engine's
explanation says when it's using it (`runScan`'s `creatorCountry`, Brief
§11's "Country" input). The validated prototype assessed territory the same
way.

## Database architecture

`prisma/schema.prisma` is the literal source of truth for every entity
(Brief §43). This section describes its shape and status; it never restates
a field list that could drift out of sync with the schema itself.

**Domain boundaries are enforced in the module layer, not by the schema.**
Nothing in the schema stops `modules/billing` from reading a `Case` row —
that discipline is enforced by what each module's `types.ts` chooses to
depend on, exactly like the connector boundary above is a convention, not a
database constraint.

**Secrets rule (Brief §44):** TikTok client secrets, Stripe secret keys and
webhook signing secrets are never modeled as plain columns a browser could
read. `ConnectorCredential.encryptedPayload` is ciphertext at rest, decrypted
only in server-only code — the same rule `.env.example` states as the reason
its secrets are server-side environment variables, never `NEXT_PUBLIC_*`
ones.

**Current reality:** the schema is complete relative to the Brief, live on
Neon, and the domain modules query it for real — among them `auth`,
`billing`, `notifications`, `audit`, `creators`, `catalog`, `rights`,
`campaigns`, `scan-results` and `cases` (see "Open decisions" → Data layer
for how the first of them were verified, and why `cases` came last). Of a
scan's inputs, the catalogue, rights records and campaigns are the
workspace's own; the connector and music identification are still the
demo dataset's fixtures, with plain-data types kept deliberately
field-compatible with this schema.

### Entities, by domain

| Domain | Models | Built today? |
|---|---|---|
| Identity & tenancy | `User`, `Workspace`, `Membership` (+`Role`), `Session` | Yes — Prisma-backed (Neon), `modules/auth`. `Session` is a documented addition to §43's "at minimum" list (see "Auth & authorization") |
| Creators & content | `Creator` (+`CreatorStatus`), `Content`, `CommercialContent` (+`Platform`) | Yes — Prisma-backed. `Creator` is the watchlist members manage (`modules/creators`, see "Creator management"), with two documented additions to §8's fields: `lastError` and `removedAt`. `Content`/`CommercialContent` are written by every scan (`modules/scan-results`) for watchlist creators only — a scan never adds a creator |
| Campaigns | `Campaign` | Yes — Prisma-backed (`modules/campaigns`): what a rights record can be scoped to, and the scan's per-creator lookup. Created by the demo data loader; managing them in the UI is still to come (see "Known gaps") |
| Music | `MusicTrack`, `MusicMatch` | Yes — Prisma-backed. `MusicTrack` is a song the workspace knows; `inCatalogue` marks the ones it administers — the Rights Library — with §10's track fields and where the song came from (`source`, `externalId`, `artworkUrl`) as documented additions. Scans write `MusicMatch` (`modules/scan-results`): one per (content, track, provider), plus a track-less one recording "nothing identified" |
| Rights | `RightsRecord`, `RightsRule`, `RightsAssessment` (+2 enums) | `RightsRecord`: yes — Prisma-backed, the Rights Library's records per song (`modules/rights`), with §10's `notes` and `source`. `RightsAssessment`: computed by `rights-engine`, persisted by `modules/scan-results` with its explanation and the rights records it matched, and re-computed in place when a song's records change. `RightsRule`: unbuilt (see below) |
| Cases | `Case`, `CaseNote`, `CaseEvidence` | `Case`/`CaseNote`: yes, Prisma-backed, with a full UI — status transitions, assignment, and notes — on the item detail page. `CaseEvidence`: out of scope (no object-storage decision) |
| Notifications | `Notification`, `NotificationPreference` | `Notification`: yes, Prisma-backed (Neon), `modules/notifications`. `NotificationPreference`: deliberately unbuilt (see "Notifications") |
| Billing | `Plan`, `PlanEntitlement`, `Subscription`, `UsageRecord` (+2 enums) | `Plan`/`Subscription`: yes, Prisma-backed (Neon); payment gateway is Stripe once configured, demo billing until then (see "Open decisions" → Payments). `PlanEntitlement`/`UsageRecord`: deliberately unbuilt (see "Billing") |
| Connectors | `Connector`, `ConnectorCredential` (+enum) | Unbuilt — nothing to configure before Phase 10 |
| Operations | `AuditLog`, `Job`, `WebhookEvent` (+enum) | `AuditLog`: yes, Prisma-backed (Neon), `modules/audit` — see "Case management". `WebhookEvent`: yes, Prisma-backed (Neon), `modules/webhooks` — Stripe webhook idempotency (see "Open decisions" → Payments). `Job`: yes, Prisma-backed, `modules/jobs` — every scan run is one, with `workspaceId` added to §21's fields; a queue that runs them is still to come (see "Open decisions" → Background jobs) |

`RightsRecord` and `RightsRule` are split per Brief §43's allowance to split
or merge entities "if there is a strong reason" — documented directly on
`RightsRule` in the schema: `RightsRecord` holds what the Rights Engine
actually evaluates today (territories, commercial/organic, term), and
`RightsRule` is a placeholder extension point for finer-grained clauses
(per-usage-type limits, per-campaign carve-outs) once a real requirement
shows up. Nothing builds against `RightsRule.kind`/`.value` speculatively
before then.

Idempotency (Brief §22) is a schema-level concern in several places —
`Creator` is unique on `(workspaceId, platform, externalId)`, `Content` on
`(creatorId, externalContentId)`, `CommercialContent` on `contentId`,
`MusicMatch` on `(commercialContentId, musicTrackId, provider)`,
`WebhookEvent` on `(source, externalId)` — so a re-delivered webhook or a
re-run scan never duplicates a row, and `modules/scan-results` writes the
scan chain as upserts on exactly these keys. `Content`'s key is per creator
rather than §22's example of `platform + external_content_id` globally: a
`Creator` belongs to one workspace, and two workspaces monitoring the same
creator each keep their own copy of a video (§15, multi-tenancy) — a global
key would let one workspace's scan claim a row another had already stored.
Two gaps the database can't close on its own: a "no track identified" match
has a null `musicTrackId`, which a unique index treats as distinct from
every other null, so `scan-results` looks that row up before writing it;
and `MusicTrack` has no unique key at all, so an identified song is matched
to one the workspace knows by ISRC, else by source id, else by title and
artist compared loosely (`modules/catalog/identity.ts`). `Case.rightsAssessmentId` is
`@unique` for the same reason (§51: "Do not spam duplicate cases. Use an
idempotency key."), which is what makes `openCase` safe to call on every
scan.

`RightsAssessmentReason`'s 8-value vocabulary (Brief §11) is fully
implemented by the real `rights-engine` module's `assess.ts` today — all 8
reasons are produced by real code paths. The schema's comment that "the demo
Artifact currently only produces a subset of these" refers to the
standalone interactive HTML prototype (`rightswatch-overview.html`, see
`DESIGN_SYSTEM.md`), which implements a simplified 6-of-8 subset for demo
purposes. That gap is between the early prototype and the schema, not a gap
in the real engine — it's already closed there.

## Auth & authorization

Session-based auth per Brief §40, with four roles: OWNER, ADMIN, ANALYST,
VIEWER. Signup creates exactly one workspace with the creator as OWNER
(Phase 5 scope — a user belongs to exactly one workspace today;
multi-workspace membership via accepting a second invite is real future
work, not built — see "Known gaps").

This follows the Next.js App Router auth guide's structure directly,
including its "Database Sessions" shape:

- **Sessions are database-backed.** The `session` cookie holds an
  HMAC-signed token (`modules/auth/session.ts`) naming a random session id;
  a `Session` row (keyed on that id's SHA-256, never the id itself) says
  whether it's still live (`modules/auth/session-lifecycle.ts`). Logging out
  deletes the row, so a copied cookie stops working at once instead of
  staying valid for its 7 days. `Session` isn't in Brief §43's entity list,
  which is explicitly "at minimum" — it's the documented addition that
  Brief §17 ("session management") needs.
- **`proxy.ts`** does only "optimistic" checks: verify the cookie's
  signature, redirect if it's missing on a protected route. It runs on every
  request, including prefetches, so it never touches a repository. The
  landing page (`/`) and the public demo entry (`/demo`) are deliberately
  untouched here, since they're meant to be public with no signup at all.
- **`app/_lib/current-user.ts`** is the Data Access Layer:
  `getCurrentSession()` / `requireSession()` do the real, secure check (the
  session row is live; the user and membership still exist), and every page
  and Server Action that needs a session calls this rather than re-deriving
  one. Server Actions never assume `proxy.ts` already ran — a matcher change
  could silently exclude them. When a cookie is sent but no longer resolves,
  `requireSession()` redirects to `/login?expired=1`, which `proxy.ts` lets
  through; without the flag the two would bounce a stale cookie between
  `/login` and `/workspace` forever.
- **`app/_lib/authorize.ts`** centralizes "who can do X":
  `canManageWorkspace` / `requireWorkspaceManager` (OWNER, ADMIN — team
  invites, billing) and `canManageCases` / `requireCaseManager` (OWNER,
  ADMIN, ANALYST — cases, the sample-scan pipeline). Each throws a plain
  `Error` on denial; there's no dedicated "forbidden" page, because the real
  UI never renders an action a role can't perform, so reaching the check at
  all means either a stale page or a forged request.

**Visibility is never role-gated; only mutations are.** Every role,
including VIEWER, can see the full case table, the full scan results, and
every notification in their workspace. Only actions — opening or resolving a
case, inviting a teammate, changing billing — are gated. This is a
deliberate, consistently applied distinction (it's what settles who receives
a notification — see "Notifications"), not an oversight.

**Credentials and tokens** (hardened after an independent security review —
no critical or high findings; every medium and low one is addressed here or
listed under "Known gaps"):

- **Passwords:** Node's built-in scrypt at OWASP's minimum (N=2^14, r=8,
  p=5), stored as `scrypt$N$r$p$salt$hash` so the cost can be raised later.
  Older `salt:hash` values (p=1) still verify and are re-hashed at the
  current cost on their owner's next successful login.
- **One secret, separate keys:** session cookies and invite links are both
  signed `body.signature` tokens, each with its own HKDF-derived key
  (`modules/auth/derive-key.ts`), so neither can ever pass as the other.
- **No account enumeration:** login answers an unknown email with the same
  error *and the same scrypt work* as a wrong password. The invite form no
  longer checks whether an email is registered — an invite for an existing
  account is turned away at acceptance, shown only to the link's holder.
  Signup still says "an account with that email already exists"; hiding it
  needs email verification (see "Known gaps").
- **Invites:** the role is re-checked when the link is read, not only when
  it's minted, so a token can never carry OWNER. Links are stateless, so
  they can't be revoked before their 7-day expiry (no `Invite` table).
- **Atomic account creation:** a user, their membership and (for signup)
  their workspace are one nested Prisma write (`AccountRepository`). Written
  separately, a failure between steps left a user with no membership who
  could neither reach a workspace nor sign up again; a slug taken by a
  concurrent signup is now simply retried.
- **Login rate limiting:** two in-memory fixed-window limiters
  (`modules/auth/rate-limiter.ts`) — 5 failures per email + client IP, and
  30 per IP across all emails. Keying on the email alone let anyone lock any
  account out; now an attacker's failures block only the attacker's
  address, and a successful login never resets the per-IP count. The client
  IP is the first `x-forwarded-for` entry, which Vercel sets itself and
  doesn't let clients spoof. Both limiters are per serverless instance; a
  shared one needs Upstash Redis (`RELEASE_CHECKLIST.md`), and the interface
  is already shaped for a drop-in `RedisRateLimiter`.
- **Password reset** (`modules/auth/password-reset*.ts`,
  `/forgot-password`, `/reset-password`): the request page answers the same
  way whether or not the email exists, and sends a link with a signed,
  single-purpose token (HKDF key "password-reset-token", 1 hour). The token
  carries a short fingerprint of the current password hash, so it works
  once: after the password changes, the same link is dead. A reset also
  deletes every session of that user (`SessionRepository.deleteAllForUser`).
  Reset requests are rate limited (3 per window, in memory like the login limits).
- **Email verification** (`modules/auth/email-verification.ts`,
  `/verify-email`): signup emails a signed link (own HKDF key, naming the
  user and the exact address, three days) and `User.emailVerifiedAt` is set
  when it is opened; opening it twice keeps the first time. Nothing is gated
  on it. A banner in the workspace asks for confirmation and offers to resend
  (rate limited), but only when a real email provider is configured, since
  asking for something nobody can do is noise. The demo is exempt.
- **Settings** (`/workspace/settings`): a status board of what the
  workspace is connected to (TikTok, song search, music in posts, email,
  payments — read from the server's configuration, nothing secret shown) and
  the signed-in person's account. "Change password" (`modules/auth/change-password.ts`)
  asks for the current password first, rate limits wrong guesses per user,
  ends every session of the user and starts a fresh one for the browser that
  made the change. It is disabled in the public demo.
- **`SESSION_SECRET`:** a short or placeholder value is logged once per
  process rather than refused, so a deployment that might be using one
  isn't taken down; a fresh random value is part of `RELEASE_CHECKLIST.md`.

## Scan pipeline

(Brief §21, §22, §50)

The full production pipeline, in order: **Scheduler → Scan Job → TikTok
Connector → Normalize → Deduplicate → Music Identification → Rights Engine →
Case Creation → Notifications.**

`runScan()` (`src/modules/scan-pipeline/`) implements the middle of that
chain — Connector → Normalize → Music Identification → Rights Engine — as a
single function with no side effects of its own, so it's equally usable from
a demo script, a real BullMQ job, or a test. Deduplication is deliberately
not reimplemented inside it: Brief §22 asks for a uniqueness strategy on
stable external ids, which is the database's job, so it happens where the
results are persisted — `modules/scan-results`, whose `saveScan` upserts the
`Content → CommercialContent → MusicMatch → RightsAssessment` chain under
a watchlist creator, on the keys described under "Database architecture".
Saving the same scan twice touches the same rows, keeps every
`RightsAssessment` id (and so every Case) attached, and never deletes: a
later scan that identifies nothing, or fails, can't erase an earlier
identification.

`Scheduler` doesn't exist yet — nothing schedules scans on a cadence. One
caller invokes `runScan()` directly today:

- **`workspace-scan-store.ts`'s `runWorkspaceScan`** — "Run scan" in a
  workspace (the public demo workspace is filled by the same call), and the one caller that stores its results and carries
  out the pipeline's last two steps, Case Creation and Notifications (see
  those sections below):
  - **Who:** the watchlist's monitored creators, oldest first, up to the
    plan's limit (§19); any past it are left out and counted on the job,
    not silently dropped.
  - **What is assessed:** posts using a song in the workspace's catalogue
    (`runScan`'s `findCatalogueTrack`). A song outside it is recorded as
    `OTHER_MUSIC` — identified, not assessed — under a `MusicTrack` with
    `inCatalogue` false, so adding it later brings those posts in (see
    "Rights Library").
  - **Which window:** since the creator was last reached, with a day's
    overlap; for a creator never scanned, the last 30 days. In demo mode
    every scan covers the whole demo window instead, back to the start of
    the demo scenarios: a new workspace sees all of them, and a song added
    since the last scan is found in posts that scan already checked — as a
    real provider's stored identifications would find it.
  - **One creator at a time**, so a failing creator (a connector error)
    marks only that creator `ERROR` with the reason and the rest go on.
  - **Recorded as a `Job`** (§21) with per-creator results, which is what
    a creator's monitoring history reads.

The engine step itself is `assessCommercialContent()`, shared by `runScan()`
and by re-assessing a song between scans (`app/_lib/reassess.ts`), so both
always reach the same verdict for the same post.

**Campaign matching** feeds into the Rights Engine's `campaignId` input: a
creator can belong to zero, one, or many campaigns (`Campaign.creators` is
many-to-many), but the engine's input is a single `campaignId: string |
null`. `runScan()` resolves this — exactly one campaign membership resolves
to that campaign's id; zero or multiple resolve to `null`, which the engine
already treats as "unknown, not definitely uncovered" (a
campaign-unrestricted rights record still clears regardless; a
campaign-scoped one routes to `UNKNOWN` / manual review rather than a false
`CLEARED` or false `POTENTIAL_MISMATCH`). This was a deliberate,
minimal-change design: redesigning the engine's own input into a
multi-value `campaignIds: string[]` set was judged more invasive than the
current fixture data justifies.

## Rights engine

(Brief §11, §16)

`assessRights()` (`src/modules/rights-engine/`) is a pure function — no
Prisma import, no I/O, unit-testable with zero database — that takes a
small, flat input (content plus the candidate rights records for its
matched track) and returns a verdict:

- **Status:** `CLEARED`, `REVIEW`, `POTENTIAL_MISMATCH`, `UNKNOWN` — never a
  legal conclusion, always a signal for a human (ANALYST/ADMIN) to act on
  inside a Case.
- **Reason** (present whenever status isn't `CLEARED`): `NO_RIGHTS_RECORD`,
  `TERM_EXPIRED`, `TERRITORY_NOT_COVERED`, `USAGE_TYPE_NOT_COVERED`,
  `COMMERCIAL_USAGE_NOT_COVERED`, `CAMPAIGN_NOT_COVERED`,
  `CONFLICTING_RIGHTS_RECORDS`, `MANUAL_REVIEW_REQUIRED` — the full 8-reason
  vocabulary from the Brief, all 8 reachable from real code in `assess.ts`
  today (see "Database architecture" for the one place this is easy to
  mis-read as an open gap).

Being framework-free and side-effect-free is the point: it's reused
unchanged by `scan-pipeline`, and would be reused unchanged from a future
one-off re-assessment script or API route.

## Creator management

(Brief §8, §19)

The watchlist is the workspace's list of creators RightsWatch checks —
`modules/creators`, `/workspace/creators` and a page per creator. A member
of the ANALYST tier or up (the schema's role comment: "monitoring + cases +
rights") can add, pause, resume, remove and edit; every change is
audit-logged (§14's first example is "user added creator").

- **Identity:** a TikTok creator is its username. The Commercial Content
  API is queried by username and returns no other stable id (§4), so
  `externalId` is the username, lowercased; a renamed account reads as a
  new creator. A username can be pasted as "@name", "name" or a profile
  link.
- **Status vs. monitoring:** `monitoringEnabled` is the switch (pause and
  resume) and what a scan reads; `status` is what the list shows (§8's
  Active, Paused, Error, Pending), kept in step by those actions and by
  each scan's outcome. `lastError` keeps the connector's reason while a
  creator is in `ERROR` (§37).
- **Removing is a soft delete** (`removedAt`): the creator leaves the
  watchlist and is never scanned again, but its posts, assessments and
  cases stay — §13: "Every case should preserve evidence". Adding the same
  username again restores the same record with its history.
- **Plan limits are enforced in the backend (§19)** where monitoring
  starts: adding a creator and resuming one are refused at the plan's
  `creatorCap` (no subscription, or a canceled one, allows none); paused
  and removed creators don't count. The billing page won't offer a plan
  smaller than what's monitored, and `choosePlanAction` refuses one. A plan
  that shrinks anyway (a downgrade in Stripe's portal) leaves the extra
  creators unscanned rather than deleted — the scan takes the oldest up to
  the limit and records how many it skipped.
- **Country** is the one detail that changes a verdict: the Commercial
  Content API reports no territory for a post, so the creator's country
  stands in when a rights record covers specific territories, and the
  assessment's explanation says so (see "Rights engine").

## Rights Library

(Brief §10)

The songs a workspace administers and what their licences cover —
`modules/catalog`, `modules/rights`, `/workspace/rights` and a page per
song. The ANALYST tier and up manage it ("monitoring + cases + rights");
every change is audit-logged against the song (`song.*`, `rights.*`).

- **Adding songs is a search**, the way a music app finds them: results
  appear while typing — title, artist or ISRC — through
  `GET /api/v1/songs/search` (members only; errors in one shape, §45).
  The provider is chosen by `MUSIC_SEARCH_PROVIDER` (`catalog-search`):
  MusicBrainz, an open music database (core data CC0, no key), by default;
  a fixed, fictional catalogue (`demo`) for tests and offline development.
  MusicBrainz asks for a User-Agent naming the app and about one request
  per second: `app/_lib/song-search.ts` caches queries for ten minutes and
  paces requests, answering "busy" rather than queueing for long. A song
  that can't be found is added by hand.
- **One song, one record.** `findSameTrack` recognises a song by ISRC,
  then by source id, then by loosely compared title and artist — so a song
  isn't added twice, and a scan that hears a catalogue song under a
  slightly different name still finds it.
- **Cover art** comes from the Cover Art Archive, through this app's own
  `GET /api/v1/artwork/{releaseId}` — only a MusicBrainz release id, only
  raster images, cached for a year — so viewing the catalogue doesn't hand
  members' IP addresses to a third party (§59). A song without a cover
  gets a generated one (`components/music/artwork.ts`), the same for that
  song everywhere.
- **Rights records** are structured, never one boolean (§10): usage
  (commercial, organic), territory (worldwide or a list of countries), a
  term (an end date covers that whole day), and a campaign scope.
  `parseRightsRecordForm` validates what a member enters; the form never
  guesses a start date.
- **Verdicts follow the library.** Adding a song a scan already heard, or
  adding, changing or deleting one of its records, re-assesses its posts
  straight away (`reassess.ts`): same engine step as a scan, verdicts
  stored over the old ones (so cases stay attached), and §51's case
  automation for anything newly flagged. Taking a song out of the
  catalogue stops future checks; its records, verdicts and cases stay
  (§13), and adding it again brings them back.
- **Heard in your creators' posts:** songs a scan identified that aren't
  in the catalogue, with how many posts used them, one click from joining.
- **Demo data** (demo mode only): one action loads the demo dataset into a
  workspace — its 48 creators, Northstar's six songs with their rights
  records, and the two campaigns — and scans, which reproduces Brief §48's
  September numbers in a real workspace. In demo mode the music provider
  also "hears" songs a workspace added itself in the dataset's generated
  posts (`demoCatalogueSongFor`), so searching for a song, adding it and
  scanning shows it being found.

## Music Matches

**Identifying a post's song by hand.** Real posts carry no music data, and no
audio recognition is connected, so every post a real scan finds starts as "no
song identified". The home feed lists those under "No song yet". On such a
post's page an analyst or above picks which of the workspace's own library
songs it uses (`identify-post.ts`, `ScanResultRepository.identifyPost`): a
match is stored marked `manual` at full confidence, the post is assessed like
any other, a case opens if it isn't cleared, and the audit log records who
identified what ("post.song_identified"). Only a post with no song yet can be
identified this way, so a provider's identification is never hidden. Later
scans don't undo it: an assessed identification outranks "nothing found".

(Brief §6)

`/workspace/matches` lists every song the scans identified in watched
creators' paid posts, one row per song: posts, creators, the verdicts on
those posts and when the newest one was published. `summarizeSongMatches`
(`modules/scan-results/song-summary.ts`) does the grouping and orders songs
by need: most potential mismatches first, then most posts waiting on a
person. A song heard in a post that isn't in the library is listed too
("Not in your library"), since that is how a missing song gets noticed.
Each row opens the song's page under the Rights Library, which shows the
posts that use it. TikTok's Commercial Content API gives no music data
(Brief §4), so this is built from what the music provider identified, not
from TikTok.

## Case management

(Brief §43)

A Case is what a human on the customer's team actually works with once the
Rights Engine and scan pipeline produce a non-`CLEARED` assessment. It has
the Brief §12 statuses (Open, In review, Waiting, Cleared, Resolved,
Dismissed) and priorities (Low, Medium, High, Critical), an assignee, and
a `CaseNote` activity log. A new case starts High for a potential
mismatch and Medium for anything the check couldn't settle
(`priority.ts`); a re-run of the scan never changes a priority a person
set. There's no enforced sequence between statuses — any is reachable from
any other.

Two places show cases: the item detail page (`case-panel.tsx` /
`case-actions.ts` — status, priority, assignee, notes) and `/workspace/cases`
(`app/workspace/cases/page.tsx`, `modules/cases/case-list.ts`) — the
working list, filterable by status, priority and assignee, most urgent
first. Every mutation is gated by `requireCaseManager`
(OWNER/ADMIN/ANALYST) regardless of what the page renders; a VIEWER reads
everything and changes nothing. `rightsAssessmentId` is 1:1 by schema
constraint, so `openCase()` is idempotent: calling it twice for the same
assessment returns the existing case rather than erroring or duplicating it
(see "Database architecture" → idempotency). `CaseEvidence` (file
attachments) is the one entity in this domain still out of scope, blocked
on an object-storage decision (see "Open decisions").

**Reports.** `/workspace/reports` summarises the stored scan results and
offers a CSV export (`workspace/reports/export/route.ts`,
`modules/reports`: `detections-report.ts` builds the rows, `csv.ts`
escapes them, including leading `=`, `+`, `-`, `@` so a spreadsheet never
runs a cell as a formula). Demo posts are labelled "Demo data: not a real
post" in the export instead of carrying a made-up TikTok link.

**Audit trail.** Every case-lifecycle mutation writes an `AuditLog` row
(`modules/audit` — Prisma-backed (Neon), not itself a numbered Brief
section) recording who did what to which case and when: `case.opened`
(both paths that can open one — the manual "Open a case" button in
`case-actions.ts`, and the scan-triggered auto-open in
`workspace-scan-store.ts`, which is actually the more common of the two in
practice), `case.status_changed` (from/to status in `metadata`), and
`case.assignee_changed` (from/to assignee in `metadata`). Writes are
guarded the same way `notifyCaseOpened` already is — only on a genuine
state change, never for a no-op re-click of the same status or a
sample-scan re-run that opens nothing new. `addCaseNoteAction` is
deliberately not audited: a note is already self-attributing (author and
timestamp render inline wherever notes appear), so a parallel audit entry
would be redundant. The audit writes live at the Server-Action/caller
layer, not inside `modules/cases` itself, following this project's
existing convention for cross-cutting side effects (see "Notifications").
`/workspace/audit` (`app/workspace/audit/page.tsx`) is the page that reads
it back — a newest-first table (when / who / what), visible to every role
with no management gate, the same as the case table and notifications
(see "Auth & authorization"). It resolves each entry's actor, and the
counterpart of an assignee-change, by looking the id up against the
workspace's own membership list (same pattern as `team/page.tsx`), and
links a "case"-targeted entry back to `/workspace/items/[contentId]` through
the case's `rightsAssessmentId`, looked up against the workspace's stored
scan items — degrading to plain, unlinked text rather than guessing
whenever a case or an id can't be resolved. Because `action` and
`targetType` are open strings by design (see `modules/audit/types.ts`),
the page's formatting logic (`components/audit/audit-log-view.ts`) has a
generic fallback for anything it hasn't been taught a richer description
for, rather than assuming the three actions written today are the only
ones that will ever exist.

## Notifications

Not itself a numbered Brief section — modeled in `prisma/schema.prisma`'s
`Notification` / `NotificationPreference` pair. In-app only: this project
has no email-sending mechanism (the same reason `inviteTeammate`'s invite
links are shown in-app rather than emailed), so in-app is the one
notification channel with no external dependency to stand up first.
`NotificationPreference` (a per-user, per-channel on/off toggle) is
deliberately unbuilt — with only one channel that actually exists, a toggle
between channels has nothing real to switch between yet.

Recipients are every current member of the workspace, not just
OWNER/ADMIN/ANALYST — a notification is visibility, not a mutation, and this
app has never gated visibility by role (see "Auth & authorization"). Idempotency
is inherited from the caller rather than reimplemented: `notifyCaseOpened`
has no de-duplication logic of its own, because it's only ever invoked when
`openCase()` reports `created: true` — so re-running a sample scan never
re-notifies about a case that already existed.

## Billing

(Brief §18–20)

`Plan` / `Subscription` are built (Prisma-backed repositories against Neon),
billing through Stripe once configured and through clearly-labeled demo
billing until then — see "Open decisions" → Payments and
`STRIPE_INTEGRATION.md`. `PlanEntitlement` (flexible per-plan feature flags)
and `UsageRecord` (periodic usage snapshots) are both modeled in the schema
but deliberately unbuilt: nothing in this codebase has a concrete
entitlement key or a billing-period usage rollup to populate them with yet,
and the one usage figure the UI actually needs (monitored creators vs.
`creatorCap`, §20) is counted live from the watchlist rather than a stored
snapshot. Building either now would be speculative scope. How the limit is
enforced is under "Creator management".

## The landing page, the public demo and the real workspace

- **Landing page** (`app/(site)/*`: `/`, `/imprint`, `/privacy`) — public
  marketing site with its own layout (`components/marketing/*`): hero with a
  drifting feed of sample videos, a keyword marquee, how it works, the
  verdict explainer, pricing from `PLAN_CATALOG`, FAQ. `imprint` and
  `privacy` are placeholders until the company details exist
  (`RELEASE_CHECKLIST.md`).
- **Public demo** (`/demo` actions, `app/_lib/demo-access.ts`) — "Try the
  demo" starts a session for a read-only VIEWER in one shared workspace
  (`northstar-demo`) filled with the demo dataset by the same
  `loadDemoWorkspace` + `runWorkspaceScan` calls any workspace can use. It is
  the real app, not a separate mock-up. The accounts have random, unknown
  passwords on a reserved `.invalid` email domain, so nobody can log in to
  them; the workspace pays with the mock payment provider even when Stripe is
  configured; a banner in the workspace layout marks the data as fictional
  and links to sign-up. The first visit after a fresh database creates it;
  later visits reuse it. Starting a session is rate limited per address.
- **The real workspace** (`/workspace/*`) — authenticated, session-gated by
  `proxy.ts` + `current-user.ts`. Its home (`/workspace`) is a feed of the
  latest videos with identified music, with the workspace's songs along the
  top as filters (`?song=`), `?show=` for review/cleared and a "show more"
  limit.

There's no real TikTok connection yet — Phase 10 is still gated on
TikTok's reply — so every workspace runs in demo mode
(`app/_lib/connector-mode.ts`), labeled "Demo data" in its top bar: "Run
scan" (`workspace-scan-store.ts`) runs the demo connector and fixture
providers over the workspace's own watchlist. The demo
connector has posts for any username — the scenarios for §62's six
creators (one click adds them), generated ones for anyone else — so a
creator a member adds is scanned like any other; and the demo provider
hears the workspace's own catalogue songs in generated posts (see "Rights
Library"). The results are stored in
that workspace and real Cases are opened against them (a real
`workspaceId`, real `RightsAssessment` rows, a real acting user). The only
thing Phase 10 changes is swapping `MockTikTokConnector` for a real one —
the watchlist, storage and the pipeline call stay as they are.

Note that TikTok's Commercial Content API returns no music information
(Brief §4), so a "TikToks by song" feed can only be built from the matches
the music provider identifies for watched creators — which is what the home
feed does.

## Routing, errors & metadata

Three Next.js App Router special files sit at the `src/app/` root and apply
across the landing page, the demo and the workspace:

- **`not-found.tsx`** — renders for the `notFound()` call in
  `workspace/items/[contentId]/page.tsx` and any unmatched URL. It
  deliberately doesn't check the session to pick a smarter "back" link:
  this file sits at the root of every route's rendering boundary, and a
  dynamic API here (such as reading the session cookie) forces every other
  page in the app into dynamic rendering too — confirmed by triggering the
  regression locally before reverting it. Its link goes to `/`.
- **`error.tsx`** — a Client Component error boundary for an uncaught
  exception under the root layout, using `retry` (stable as of Next
  16.3, matching this project's 16.3.6) rather than the older `reset`.
- **`global-error.tsx`** — the same, for an error thrown by the root
  layout itself; it replaces the whole document, so it imports
  `globals.css` directly rather than relying on `layout.tsx`, which
  doesn't render around it.

All three were verified against the running dev server with a headless
browser, not just by reading the code: dev-mode SSR streams an error
segment for the client to resolve instead of always rendering the fallback
UI server-side, so `curl` alone can show the wrong thing (Next's own
`__next_error__` shell) even when the boundary is working correctly.

`workspace/items/[contentId]/page.tsx` also has a `generateMetadata`
giving the browser tab a per-item title (`"@handle — RightsWatch"`)
instead of sharing one generic title across every open tab. Their
not-found branch sets the title explicitly (`"Page not found —
RightsWatch"`, matching `not-found.tsx`) rather than returning `{}`:
verified live that an empty object does *not* fall through to the
`not-found.tsx` boundary's own title once a page with its own
`generateMetadata` calls `notFound()` — it resolves to the root layout's
plain "RightsWatch" instead.

## Phases referenced in this codebase

Only the phases below are ever named in code comments. Gaps in the
numbering (1–3, 7–9) are real gaps in what's been recorded before now — this
table doesn't guess at what they might cover.

| Phase | Covers | Status |
|---|---|---|
| 4 | Prisma schema / data layer | Schema written and live on Neon; client can't generate locally in this sandbox, but does on Vercel's build |
| 5 | Auth module — signup, login, sessions, one workspace per user | Built |
| 6 | Demo Mode — first public fixture pages; replaced by the public demo workspace (see "The landing page, the public demo and the real workspace") | Built |
| 10 | Real TikTok connector | Written and tested with stubbed responses; credentials and a first live scan are pending |

A separate, unrelated "Phase 2" label appears in this project's own task
tracking and in code comments added during the Neon/Prisma cutover (e.g.
`PrismaAuditLogRepository`'s doc comment) — it names this project's own
second major work initiative (wiring real infrastructure in, after Phase
1's full-featured build against fixtures), not a Brief-numbered phase. It
isn't listed in the table above for that reason: mixing it in would imply
an ordering relative to Phases 4–10 that doesn't exist.

## Testing & verification conventions

- Every implementation file (`foo.ts`) has a sibling `foo.test.ts`, run via
  Node's built-in test runner through `tsx --test src/**/*.test.ts`
  (`npm test`).
- New code is verified at multiple levels before being considered done: the
  test suite, `tsc` with no errors, `eslint` clean, a real production build
  (`next build`), and — for anything with an HTTP surface — real
  `curl`-level verification against the running dev server (extracting
  Next.js Server Action IDs from rendered HTML and replicating the exact
  multipart POST a browser form would send), not just calling functions
  directly in a script.
- Screenshots are taken for anything with a UI, as part of "done" rather
  than assumed from reading the code.
- Anything that writes to the database is also run end to end against a
  local Postgres — `npm run db:local`, then `npm run db:local:push` and
  `npx prisma db seed` with `DATABASE_URL` pointed at it (usage in
  `scripts/local-db/push-schema.mjs`), then the dev server on that
  database driven by a headless browser — so constraints, foreign keys and
  transactions are exercised before deploying, not first in production.
  Unit tests run against the in-memory repositories and can't see any of
  those.

## Environment configuration

`.env.example` documents every variable the app reads; copy it to `.env` for
local development and never commit real values.

| Variable(s) | Purpose | Current status |
|---|---|---|
| `DATABASE_URL` | Postgres connection (local dev fallback) | Used for local Postgres only — production reads Neon's own `storagee_*` vars instead (see "Open decisions" → Data layer) |
| `SESSION_SECRET` | Every signing key (session cookie, invite links) is derived from it | Required for auth to work at all; at least 32 random characters, replaced with a fresh value before launch (`RELEASE_CHECKLIST.md`) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_GROWTH`, `STRIPE_PRICE_ID_AGENCY` | Payments (Stripe test mode) | Not set yet — demo billing until all five are set in Vercel (`STRIPE_INTEGRATION.md`) |
| `MUSIC_SEARCH_PROVIDER` | Song search for the Rights Library: `musicbrainz` (default) or `demo` | Unset in production (MusicBrainz); `demo` for local checks and tests, where the public service isn't reachable |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | Real TikTok connector | Blank — demo connector used. Setting both switches every workspace except the public demo to the real one |
| `REDIS_URL` | BullMQ (Upstash Redis, or any Redis-compatible URL) | Unused — nothing queues jobs yet |
| `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_ENDPOINT` | Object storage (S3-compatible) | Blank — no provider chosen; blocks `CaseEvidence` |
| `SENTRY_DSN` | Monitoring | Blank — not wired up |
| `DEMO_MODE` | Forces Demo Mode regardless of connector configuration | `"true"` |

## Known gaps and deliberately out-of-scope work

Worth distinguishing "blocked" from "deliberately not built yet," so neither
reads as an oversight:

**Blocked on something outside this codebase's control:**
- Querying Neon itself from this sandbox — its hostname isn't reachable
  from here, so production data is only ever touched by the deployed app.
  Everything else about Prisma now runs locally against a real Postgres
  (see "Open decisions" → Data layer). That wasn't true when the `cases`
  foreign-key regression above shipped, which is why the constraint was
  first enforced in production; it's caught locally now.
- Running the real TikTok connector — it's written and tested against stubbed
  responses, and waits on TikTok's API-access reply for credentials (TikTok
  webhooks, the other `WebhookEvent` source, come with it). Also unbuilt:
  audio recognition, so real posts carry no identified song until a person
  says which one (see "Music Matches")
- Stripe going live — built and tested; waiting on a Stripe account, three
  test-mode prices and a webhook destination (`STRIPE_INTEGRATION.md`)
- Background job queue (`Job`) — BullMQ/Upstash Redis is the chosen
  approach (see "Open decisions" → Background jobs); no Redis is
  provisioned yet

**Deliberately not built — would be speculative scope today:**
- `PlanEntitlement` / `UsageRecord` (billing) — no concrete entitlement or
  usage rollup exists yet to populate them with
- `NotificationPreference`, and an email notification channel — only one
  channel exists, so there's nothing to toggle between, and no
  email-sending mechanism exists to add a second channel with
- `CaseEvidence` file attachments — no object-storage decision yet
- Multi-workspace membership — Phase 5 scope is one workspace per user;
  turning `current-user.ts` into a workspace picker is a bigger, riskier
  change than anything else on this list
- Signup rate-limiting by IP — the host is settled now (Vercel), but a
  per-process, in-memory limiter only sees one serverless instance's
  traffic; this waits on the same shared store (Upstash Redis) the login
  limiter should move to
- Signup is still the one place that reveals whether an email is
  registered (Brief §17 asks for it not to; fixing it means signing up
  without saying so, which needs working email first)
- Revoking an invite link before it expires — needs an `Invite` table the
  schema doesn't have; links are stateless and expire after 7 days
- Managing campaigns (§2, and §8's "group creators" and "assign
  campaign") — campaigns are real workspace data now, and a rights record
  can be scoped to them, but only the demo data loader creates them and
  signs creators up; a creator's page shows its campaigns read-only
- A custom favicon / brand mark — `src/app/favicon.ico` is still the
  default `create-next-app` icon (unmodified since the original scaffold);
  there's no logo yet to replace it with

## Document provenance

This document was assembled entirely from doc comments already scattered
across `src/modules/*/types.ts`, `src/app/_lib/*.ts`, and
`prisma/schema.prisma` — every citation above already existed in code before
this file did. When a code comment cites "ARCHITECTURE.md" for something not
covered above, that's a sign this document has drifted and should be
updated to match the code, not the other way around — the code and its own
doc comments remain the more granular, more frequently updated source.
