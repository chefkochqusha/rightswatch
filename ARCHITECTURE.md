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
| ORM | Prisma (`prisma/schema.prisma`) | Schema complete; client can't be generated in this sandbox — see "Open decisions" |
| Database | PostgreSQL, hosted on Neon | Chosen, not provisioned — see "Open decisions" |
| Background jobs | BullMQ on Upstash Redis | Chosen, not wired — see "Open decisions" |
| Auth | Session-based, signed cookie (Brief §40) | Built, in-memory-backed |
| Payments | Stripe (test mode) | Mocked (`MockPaymentProvider`); no real keys configured |
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
- **Current reality:** `prisma generate` cannot run in this build sandbox —
  it needs to download a query-engine binary, and this sandbox's outbound
  network access is allowlisted to package registries and GitHub only.
  Every repository interface in `src/modules/*` (`UserRepository`,
  `CaseRepository`, `RightsRepository`, and so on) is therefore backed by an
  in-memory (`InMemory*`) or fixture (`Fixture*`) implementation today,
  written to be field-compatible with the Prisma schema so a `Prisma*`
  implementation is a drop-in replacement later with no change to the
  business logic or pages that call it.

### Background jobs

- **BullMQ, backed by Upstash Redis.** BullMQ and its durable `Job` audit
  row are Brief §21; Upstash specifically is a standing project decision
  (pairing naturally with Neon's serverless-first hosting story), not a
  Brief citation.
- **Current reality:** nothing is queued yet. The scan pipeline runs
  synchronously, in-process, triggered by a Server Action ("Run a sample
  scan") rather than a scheduled job. `Job` and `WebhookEvent` exist in the
  Prisma schema but have no application code reading or writing them.

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

Stripe, in test mode, per the Brief's billing plan (§18–20). No real Stripe
keys are configured; `MockPaymentProvider` stands in at the same interface
a real Stripe-backed `PaymentProvider` would implement.

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

**Current reality:** every domain module is backed by an in-memory or
fixture repository (see "Open decisions" → Data layer), not by Prisma
queries against this schema. The schema is complete relative to the Brief,
and every module's plain-data types are deliberately field-compatible with
it — but no code under `src/` currently executes a Prisma query.

### Entities, by domain

| Domain | Models | Built today? |
|---|---|---|
| Identity & tenancy | `User`, `Workspace`, `Membership` (+`Role`) | Yes — in-memory (`modules/auth`) |
| Creators & content | `Creator`, `Content`, `CommercialContent` (+`Platform`) | Represented via `connectors` module types; no Prisma-backed rows |
| Campaigns | `Campaign` | Yes — fixture-backed lookup (`modules/campaigns`) |
| Music | `MusicTrack`, `MusicMatch` | Represented via `music` module types; no Prisma-backed rows |
| Rights | `RightsRecord`, `RightsRule`, `RightsAssessment` (+2 enums) | `RightsRecord`: fixture lookup (`modules/rights`). `RightsAssessment`: computed on the fly by `rights-engine`, never persisted. `RightsRule`: unbuilt (see below) |
| Cases | `Case`, `CaseNote`, `CaseEvidence` | `Case`/`CaseNote`: yes, in-memory (`modules/cases`), with a full UI — status transitions, assignment, and notes — on the item detail page. `CaseEvidence`: out of scope (no object-storage decision) |
| Notifications | `Notification`, `NotificationPreference` | `Notification`: yes, in-memory (`modules/notifications`). `NotificationPreference`: deliberately unbuilt (see "Notifications") |
| Billing | `Plan`, `PlanEntitlement`, `Subscription`, `UsageRecord` (+2 enums) | `Plan`/`Subscription`: yes, in-memory + `MockPaymentProvider`. `PlanEntitlement`/`UsageRecord`: deliberately unbuilt (see "Billing") |
| Connectors | `Connector`, `ConnectorCredential` (+enum) | Unbuilt — nothing to configure before Phase 10 |
| Operations | `AuditLog`, `Job`, `WebhookEvent` (+enum) | `AuditLog`: yes, in-memory (`modules/audit`) — see "Case management". `Job`/`WebhookEvent`: unbuilt, both genuinely blocked on infrastructure this project doesn't have (BullMQ/Redis; a real webhook source) rather than just not-yet-written |

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

This follows the Next.js App Router auth guide's structure directly:

- **`proxy.ts`** does only "optimistic" checks: decode the signed session
  cookie, redirect if it's missing on a protected route. It runs on every
  request, including prefetches, so it never touches a repository. Demo
  Mode (`/`, `/dashboard`, `/creators`, `/assessments/*`) is deliberately
  untouched here, since it's meant to be public with no signup at all.
- **`app/_lib/current-user.ts`** is the Data Access Layer:
  `getCurrentSession()` / `requireSession()` do the real, secure check
  (confirming the user and membership still exist), and every page and
  Server Action that needs a session calls this rather than re-deriving one.
  Server Actions never assume `proxy.ts` already ran — a matcher change
  could silently exclude them.
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

Login attempts are rate-limited by a process-local, in-memory fixed-window
limiter (`modules/auth/rate-limiter.ts`), scoped to login only — signup
abuse is a different problem (disposable emails, scripted account creation)
best solved with IP-based throttling or CAPTCHA, and this project has no
settled convention yet for trusting a forwarded-IP header from a host that
hasn't been chosen (see "Known gaps"). A real deployment moves the rate
limiter to Upstash Redis; the interface is already shaped for a drop-in
`RedisRateLimiter`.

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
(`modules/audit` — in-memory, schema-shaped, not itself a numbered Brief
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

`Plan` / `Subscription` are built (in-memory repositories, `MockPaymentProvider`
standing in for Stripe). `PlanEntitlement` (flexible per-plan feature flags)
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
| 4 | Prisma schema / data layer | Schema written; client can't generate in this sandbox |
| 5 | Auth module — signup, login, sessions, one workspace per user | Built |
| 6 | Demo Mode — public, fixture-data pages, no signup | Built |
| 10 | Real TikTok connector | Blocked on TikTok API access/credentials |

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

## Environment configuration

`.env.example` documents every variable the app reads; copy it to `.env` for
local development and never commit real values.

| Variable(s) | Purpose | Current status |
|---|---|---|
| `DATABASE_URL` | Postgres connection (Neon pooled string) | Set for a real Postgres later; unused while repositories are in-memory |
| `SESSION_SECRET` | Signs the session cookie | Required for real auth to work at all |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments | Blank — `MockPaymentProvider` used instead |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | Real TikTok connector | Blank until Phase 10 — mock connector used instead |
| `REDIS_URL` | BullMQ (Upstash Redis, or any Redis-compatible URL) | Unused — nothing queues jobs yet |
| `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_ENDPOINT` | Object storage (S3-compatible) | Blank — no provider chosen; blocks `CaseEvidence` |
| `SENTRY_DSN` | Monitoring | Blank — not wired up |
| `DEMO_MODE` | Forces Demo Mode regardless of connector configuration | `"true"` |

## Known gaps and deliberately out-of-scope work

Worth distinguishing "blocked" from "deliberately not built yet," so neither
reads as an oversight:

**Blocked on something outside this codebase's control:**
- Prisma-backed persistence — this sandbox's network restrictions block
  `prisma generate`
- The real TikTok connector — Phase 10, waiting on TikTok's API-access reply
- Real Stripe integration — no real keys available to configure
- Background job queue (`Job`) — BullMQ/Upstash Redis is the chosen
  approach (see "Open decisions" → Background jobs), but this sandbox is
  subject to the same network restrictions that block Prisma: there's no
  reaching a real Redis instance from here either
- Webhook ingestion (`WebhookEvent`) — needs a real external source
  actually delivering webhooks to a real, publicly reachable endpoint,
  which this sandbox doesn't have

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
- Signup rate-limiting by IP — no settled convention yet for trusting a
  forwarded-IP header from a host that hasn't been chosen
- A custom favicon / brand mark — `src/app/favicon.ico` is still the
  default `create-next-app` icon (unmodified since the original scaffold);
  there's no logo yet to replace it with

**Never attempted, not requested:**
- Deployment, to Vercel or anywhere else

## Document provenance

This document was assembled entirely from doc comments already scattered
across `src/modules/*/types.ts`, `src/app/_lib/*.ts`, and
`prisma/schema.prisma` — every citation above already existed in code before
this file did. When a code comment cites "ARCHITECTURE.md" for something not
covered above, that's a sign this document has drifted and should be
updated to match the code, not the other way around — the code and its own
doc comments remain the more granular, more frequently updated source.
