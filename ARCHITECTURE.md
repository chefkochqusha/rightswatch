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
- **Four repository domains are Prisma-backed and live**, verified against
  production Neon with a real signup → dashboard → logout → login
  round-trip, not just a successful build: `auth`
  (`User`/`Workspace`/`Membership`), `billing` (`Plan`/`Subscription`),
  `notifications` (`Notification`), and `audit` (`AuditLog`).
- **`cases` is not, even though `PrismaCaseRepository` exists.**
  `Case.rightsAssessmentId` is a foreign key to `RightsAssessment.id`, and
  nothing persists `RightsAssessment` rows yet — the scan pipeline's
  results still live in `workspace-scan-store.ts`'s process memory, keyed
  by a synthetic `workspaceId::contentId` string. Wiring `case-store.ts` to
  Postgres anyway (6b69b95) turned every "Run a sample scan" and "Open a
  case" into a foreign-key violation in production; reverted to the
  in-memory repositories until the scan pipeline persists its own
  `Content → CommercialContent → MusicMatch → RightsAssessment` chain.
  Recorded here on purpose: a repository swap is only a drop-in if every
  foreign key its rows carry points at rows something actually writes —
  check the schema's relations, not just the interface's shape.
- **In-memory state is per serverless instance on Vercel.** It's lost on
  every redeploy and never shared between instances, so everything
  user-visible that still lives there — sample-scan results and cases —
  is ephemeral in production, while the notifications and audit entries
  that point at them are durable. That mismatch is a known bug being fixed
  by persisting the scan pipeline (see above), not an accepted trade-off.
  Every other repository interface in `src/modules/*` (`RightsRepository`,
  `CampaignRepository`, and the `connectors`/`music`/`creators`
  boundaries) remains in-memory (`InMemory*`) or fixture (`Fixture*`),
  kept field-compatible with the Prisma schema.
- **Rights, creators and campaigns are workspace data the Brief has users
  manage — not built yet, rather than reference data synced from
  elsewhere.** An earlier version of this document said the opposite,
  after reading only the start of the Brief: §10 calls the Rights Library
  "one of the most important product areas" (structured per-track rights a
  workspace maintains), and §8 makes creators first-class records users
  add, pause, resume and assign to campaigns. Their `Fixture*` stand-ins
  are placeholders for those features, which are on the build list along
  with persisting scan results. `Connector`/`ConnectorCredential` arrive
  with the real TikTok connector, which is what has something to store
  in them.
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
- **Current reality:** nothing is queued yet. The scan pipeline runs
  synchronously, in-process, triggered by a Server Action ("Run a sample
  scan") rather than a scheduled job. `Job` exists in the Prisma schema but
  has no application code reading or writing it. (`WebhookEvent`, the other
  operations table, is live — see "Payments".)

### Object storage

Not decided. `.env.example`'s `STORAGE_*` variables are blank placeholders.
`CaseEvidence` (Brief §43) is modeled in the schema but out of scope in
application code until a provider is chosen.

### Email

No provider is integrated. Every place that would otherwise need outbound
email works around it by surfacing the content in-app instead:
`inviteTeammate`'s invite links are shown in-app for the inviter to copy and
send themselves, and in-app notifications are the only notification channel
(see "Notifications" below) for the same reason.

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
  `InMemory*Repository` is for data this app itself creates and mutates
  (users, cases, notifications); `Fixture*Repository`/`Fixture*Provider` is
  for read-only reference data a workspace already has on file, reset to
  the same seed data every time by design (rights records, campaigns, music
  identification, TikTok content). Which shape a module gets mirrors which
  Prisma models are expected to get real CRUD versus which are reference
  data a real integration would sync in from elsewhere.
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
| `rights` | Read-only lookup of a workspace's `RightsRecord`s by track | §42 |
| `campaigns` | Read-only lookup of a creator's campaign memberships | §11 |
| `scan-pipeline` | Wires connector → music ID → rights engine into one scan | §8, §21–§23 |
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

`MockTikTokConnector` is the only implementation today. It returns
deterministic fixture data modeled directly on the real TikTok Commercial
Content API's response shape as confirmed live during this project (Brief
§4: `id`, `create_timestamp`, `create_date`, `label`, `brand_names`,
`creator`, `videos` — notably no track title, no ISRC, no audio fingerprint,
which is exactly why music identification is a separate boundary rather than
assumed to come from the platform).

The real connector — `TikTokCommercialContentConnector` in the Brief's own
naming (a distinct `TikTokResearchConnector` is also named) — is Phase 10,
and is gated: it can't be built against the live API until TikTok access and
API credentials are confirmed (Brief §4). `.env.example`'s
`TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET` are blank for exactly this reason
— until they're set, the app runs against the mock connector only, and
`DEMO_MODE=true` forces this regardless of connector configuration.

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
`FixtureMusicIdentificationProvider` is the only one built today.

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
Neon, and four domain modules query it for real — `auth`, `billing`,
`notifications`, `audit` (see "Open decisions" → Data layer for which, how
that was verified, and why `cases` had to be reverted). Every other domain
module is still backed by an in-memory or fixture repository, with
plain-data types kept deliberately field-compatible with this schema.

### Entities, by domain

| Domain | Models | Built today? |
|---|---|---|
| Identity & tenancy | `User`, `Workspace`, `Membership` (+`Role`), `Session` | Yes — Prisma-backed (Neon), `modules/auth`. `Session` is a documented addition to §43's "at minimum" list (see "Auth & authorization") |
| Creators & content | `Creator`, `Content`, `CommercialContent` (+`Platform`) | Represented via `connectors` module types; no Prisma-backed rows |
| Campaigns | `Campaign` | Yes — fixture-backed lookup (`modules/campaigns`) |
| Music | `MusicTrack`, `MusicMatch` | Represented via `music` module types; no Prisma-backed rows |
| Rights | `RightsRecord`, `RightsRule`, `RightsAssessment` (+2 enums) | `RightsRecord`: fixture lookup (`modules/rights`). `RightsAssessment`: computed on the fly by `rights-engine`, never persisted. `RightsRule`: unbuilt (see below) |
| Cases | `Case`, `CaseNote`, `CaseEvidence` | `Case`/`CaseNote`: yes, with a full UI — status transitions, assignment, and notes — on the item detail page; in-memory until `RightsAssessment` rows are persisted (`Case` has a foreign key to it — see "Open decisions" → Data layer). `CaseEvidence`: out of scope (no object-storage decision) |
| Notifications | `Notification`, `NotificationPreference` | `Notification`: yes, Prisma-backed (Neon), `modules/notifications`. `NotificationPreference`: deliberately unbuilt (see "Notifications") |
| Billing | `Plan`, `PlanEntitlement`, `Subscription`, `UsageRecord` (+2 enums) | `Plan`/`Subscription`: yes, Prisma-backed (Neon); payment gateway is Stripe once configured, demo billing until then (see "Open decisions" → Payments). `PlanEntitlement`/`UsageRecord`: deliberately unbuilt (see "Billing") |
| Connectors | `Connector`, `ConnectorCredential` (+enum) | Unbuilt — nothing to configure before Phase 10 |
| Operations | `AuditLog`, `Job`, `WebhookEvent` (+enum) | `AuditLog`: yes, Prisma-backed (Neon), `modules/audit` — see "Case management". `WebhookEvent`: yes, Prisma-backed (Neon), `modules/webhooks` — Stripe webhook idempotency (see "Open decisions" → Payments). `Job`: unbuilt, blocked on BullMQ/Redis rather than just not-yet-written |

`RightsRecord` and `RightsRule` are split per Brief §43's allowance to split
or merge entities "if there is a strong reason" — documented directly on
`RightsRule` in the schema: `RightsRecord` holds what the Rights Engine
actually evaluates today (territories, commercial/organic, term), and
`RightsRule` is a placeholder extension point for finer-grained clauses
(per-usage-type limits, per-campaign carve-outs) once a real requirement
shows up. Nothing builds against `RightsRule.kind`/`.value` speculatively
before then.

Idempotency is a schema-level concern in several places — `Content` is
unique on `(platform, externalContentId)`, `MusicMatch` on
`(commercialContentId, musicTrackId, provider)`, `WebhookEvent` on `(source,
externalId)` — all so a re-delivered webhook or a re-run scan never
duplicates a row. The schema's own inline comments cite all three as Brief
§22; `scan-pipeline/types.ts` cites the same content-deduplication concept as
Brief §23. That's a small, pre-existing inconsistency in citation between
the two files — left as-is here rather than silently resolved without the
Brief itself in hand to check against. `Case.rightsAssessmentId` is
`@unique` for the same idempotency reason, generalizing the theme to an
entity neither citation's list explicitly named (see `openCase`'s own doc
comment) — application-level deduplication (`scan-pipeline`, `openCase`,
`notifyCaseOpened`) exists today because there's no real database enforcing
it yet; once Prisma is live, some of that logic becomes a Prisma `upsert`
instead (already called out in `scan-pipeline/types.ts`).

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
  request, including prefetches, so it never touches a repository. Demo
  Mode (`/`, `/dashboard`, `/creators`, `/assessments/*`) is deliberately
  untouched here, since it's meant to be public with no signup at all.
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
- **`SESSION_SECRET`:** a short or placeholder value is logged once per
  process rather than refused, so a deployment that might be using one
  isn't taken down; a fresh random value is part of `RELEASE_CHECKLIST.md`.

## Scan pipeline

(Brief §8, §21–§23)

The full production pipeline, in order: **Scheduler → Scan Job → TikTok
Connector → Normalize → Deduplicate → Music Identification → Rights Engine →
Case Creation → Notifications.**

`runScan()` (`src/modules/scan-pipeline/`) implements the middle of that
chain — Connector → Normalize → Music Identification → Rights Engine — as a
single function with no side effects of its own, so it's equally usable from
a demo script, a real BullMQ job, or a test. Deduplication is deliberately
not reimplemented inside it: Brief §23 keys it as a persistence-layer
concern (a Prisma `upsert` on the idempotency keys described under
"Database architecture"), so it belongs wherever the results are actually
persisted, not in a side-effect-free pipeline step.

`Scheduler` and `Scan Job` don't exist yet — nothing schedules scans on a
cadence. Two callers invoke `runScan()` directly today:

- **`get-demo-scan-results.ts`** — Demo Mode's public pages, recomputed
  fresh on every request, nothing persisted.
- **`workspace-scan-store.ts`** — the real, authenticated workspace's "Run a
  sample scan" button. This is the one caller that also carries out the
  pipeline's last two documented steps, Case Creation and Notifications (see
  those sections below), against a real, logged-in workspace rather than an
  anonymous demo visitor.

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

## Case management

(Brief §43)

A Case is what a human on the customer's team actually works with once the
Rights Engine and scan pipeline produce a non-`CLEARED` assessment — assign
it, note on it, move it between `OPEN`, `IN_PROGRESS`, `RESOLVED` and
`DISMISSED`. There's no enforced sequence between the four — the UI renders
all four as buttons at once, any of them reachable from any other, since
the app doesn't yet have a reason to forbid, say, reopening a `RESOLVED`
case. All of this is built end-to-end on the item detail page (`case-panel.tsx` /
`case-actions.ts`): status-transition buttons, an assign-to-me/unassign
toggle, and a `CaseNote` activity log with a form to add to it — every
mutation gated by `requireCaseManager` (OWNER/ADMIN/ANALYST) regardless of
what the page itself renders. `rightsAssessmentId` is 1:1 by schema
constraint, so `openCase()` is idempotent: calling it twice for the same
assessment returns the existing case rather than erroring or duplicating it
(see "Database architecture" → idempotency). `CaseEvidence` (file
attachments) is the one entity in this domain still out of scope, blocked
on an object-storage decision (see "Open decisions").

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
links a "case"-targeted entry back to `/workspace/items/[contentId]` by
reversing `getRightsAssessmentId` (`getContentIdFromRightsAssessmentId` in
`workspace-scan-store.ts`) — degrading to plain, unlinked text rather than
guessing whenever a case or an id can't be resolved. Because `action` and
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
and the one usage figure the UI actually needs (tracked creators vs.
`creatorCap`) is read live off `workspace-scan-store.ts` rather than a
stored snapshot. Building either now would be speculative scope.

## Demo Mode vs. the real workspace

Two parallel surfaces exist on purpose:

- **Demo Mode** (`/`, `/dashboard`, `/creators`, `/assessments/*`) — Phase
  6. Public, unauthenticated, fixture data recomputed fresh on every
  request. Exists so a prospect can see the product with zero signup.
- **The real workspace** (`/workspace/*`) — Phase 5 (signup/auth) onward.
  Authenticated, session-gated by `proxy.ts` + `current-user.ts`.

A freshly signed-up workspace has no real TikTok connection yet — Phase 10
is still gated on TikTok's reply — so it would otherwise sit empty. "Run a
sample scan" (`workspace-scan-store.ts`) bridges this: it runs the exact
same fixture pipeline Demo Mode uses, but persists the results *into that
real workspace* and opens real Cases against them, which is what makes them
meaningful (a real `workspaceId`, a real logged-in acting user) in a way the
anonymous public demo's output isn't. The only thing Phase 10 changes is
swapping `MockTikTokConnector` for a real one and the in-memory `Map` in
`workspace-scan-store.ts` for real Prisma-backed tables — the pipeline call
itself doesn't change.

## Routing, errors & metadata

Three Next.js App Router special files sit at the `src/app/` root and apply
across both Demo Mode and the real workspace, since there's no route-group
split between them (see above):

- **`not-found.tsx`** — renders for both of this app's real `notFound()`
  call sites (`assessments/[contentId]/page.tsx`,
  `workspace/items/[contentId]/page.tsx`) and any unmatched URL. It
  deliberately doesn't check the session to pick a smarter "back" link:
  this file sits at the root of every route's rendering boundary, and a
  dynamic API here (such as reading the session cookie) forces every other
  page in the app into dynamic rendering too — confirmed by triggering the
  regression locally (it turned `/`, `/creators`, `/dashboard`, `/login`,
  `/signup`, and every prerendered `/assessments/*` path from static/SSG
  into server-rendered-on-demand) before reverting it. `/` has the same
  constraint and the same answer — it always sends visitors to
  `/dashboard` regardless of session (`app/page.tsx`).
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

`assessments/[contentId]/page.tsx` and
`workspace/items/[contentId]/page.tsx` also each have a `generateMetadata`
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
| 6 | Demo Mode — public, fixture-data pages, no signup | Built |
| 10 | Real TikTok connector | Blocked on TikTok API access/credentials |

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
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | Real TikTok connector | Blank until Phase 10 — mock connector used instead |
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
- The real TikTok connector — Phase 10, waiting on TikTok's API-access reply
  (TikTok webhooks, the other `WebhookEvent` source, come with it)
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
- Email verification and password reset — Brief §17 asks for their
  architecture; next on the build list. Until then signup is the one place
  that still reveals whether an email is registered (see "Auth &
  authorization")
- Revoking an invite link before it expires — needs an `Invite` table the
  schema doesn't have; links are stateless and expire after 7 days
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
