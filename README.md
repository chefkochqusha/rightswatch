# RightsWatch

RightsWatch is a B2B SaaS product for music publishers and labels that
detects unlicensed commercial (paid-partnership / "#ad") use of their
catalog by TikTok creators. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for
the full system design and [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) for UI
conventions — both describe what's actually built today, not an
aspirational spec.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). **Demo Mode** — the
public dashboard, creators list, and assessment pages — works immediately
with no configuration: it runs entirely against deterministic fixture data
(a mocked TikTok connector, a mocked music-identification provider, fixture
rights records), so there's nothing to connect and nothing to seed.

`npm install` runs `prisma generate` as a postinstall step, which fails in
any network-restricted environment (it needs to download engine binaries
from `binaries.prisma.sh`) with something like:

```
Error: Failed to fetch sha256 checksum at https://binaries.prisma.sh/... - 403 Forbidden
```

The only thing it fails to download is Prisma's native schema engine, which
`generate` never actually runs — it just refuses to start without one. So
in a restricted environment, point it at any executable instead:

```bash
PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate
```

`npm run dev`/`npm test`/`tsc`/`eslint` all work with or without a
generated client (the Prisma-backed repositories load it lazily, at the
moment a query runs). Signing up, logging in, or anything else that writes
to the database needs a Postgres and a generated client.

To run the real, authenticated workspace (sign up, run a sample scan, open
cases, invite teammates) locally, start a local Postgres and push the
schema to it — `scripts/local-db/push-schema.mjs` explains each step:

```bash
cp .env.example .env              # then set SESSION_SECRET to a long random string
npm run db:local                  # local Postgres (prisma dev); leave it running
export DATABASE_URL="postgres://postgres:postgres@localhost:55432/template1?sslmode=disable"
npm run db:local:push             # create the tables
npx prisma db seed                # the plan catalog
npm run dev
```

Everything else in `.env.example` is optional — see `ARCHITECTURE.md` →
"Environment configuration" for what each variable does, and
`RELEASE_CHECKLIST.md` for what gets set up at launch.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build (`next build`) |
| `npm start` | Serve a production build |
| `npm run lint` | ESLint |
| `npm test` | Run the test suite (Node's built-in test runner via `tsx`) |
| `npm run db:migrate` | `prisma migrate dev` — needs the native schema engine, so not usable where `binaries.prisma.sh` is unreachable; the project syncs with `db push` instead |
| `npm run db:push` | `prisma db push` — syncs the schema to the configured Postgres, no migration history needed; what production runs on every build |
| `npm run db:local` | A local Postgres via `prisma dev`, for running the app end to end |
| `npm run db:local:push` | Pushes the schema to that local Postgres without the native engine (`scripts/local-db/push-schema.mjs`); refuses any non-local database |

## Current status

The core is built and tested end to end: auth, the creator watchlist with
plan limits, the rights engine, the scan pipeline (against a demo TikTok
connector and demo music identification), cases, notifications, the audit
log and billing. Everything they store is in Postgres (Neon): auth with
database-backed sessions, creators, scan results and scan jobs, cases,
notifications, the audit log and billing.

Still to build from the Master Brief: the song catalogue and Rights
Library, the home feed, a cases list and report export, settings, the
landing and pricing pages, password reset and email verification, the real
TikTok connector, and scheduled scans. Everything that needs an account,
money or a legal decision waits for launch: `RELEASE_CHECKLIST.md`.

Billing runs on Stripe (test mode) as soon as its five environment
variables are set in Vercel, and on clearly-labeled demo billing until
then — no code change either way. `STRIPE_INTEGRATION.md` has the setup
steps and how to check it works.

`ARCHITECTURE.md` has the full picture: what's built, what's blocked and on
what, and what's deliberately left out of scope for now.

## Project structure

- `src/app/` — Next.js App Router routes: Demo Mode (`/`, `/dashboard`,
  `/creators`, `/assessments/*`) and the real workspace (`/workspace/*`,
  `/login`, `/signup`, `/invite/accept`).
- `src/modules/` — domain logic, independent of Next.js: connectors, music
  identification, the rights engine, campaigns, the scan pipeline and its
  stored results, cases, notifications, audit, billing, auth. Each depends only on its own repository/provider
  interfaces, never a concrete storage technology — see `ARCHITECTURE.md` →
  "Module-layer architecture".
- `src/components/` — shared UI, documented in `DESIGN_SYSTEM.md`.
- `prisma/schema.prisma` — the data model; see `ARCHITECTURE.md` →
  "Database architecture" for its current status.
