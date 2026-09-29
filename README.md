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

This is expected wherever that host isn't reachable, and safe to ignore for
local development: every real dependency still installs correctly, and
`npm run dev`/`npm test`/`tsc`/`eslint` all work with no generated client
present — the four domain modules that are Prisma-backed in production
(auth, billing, notifications, audit; see "Current status" below) only ever
load the generated client lazily, at the moment a repository method
actually runs. Only signing up, logging in, or otherwise exercising one of
those four modules against a real Postgres locally needs a successful
`prisma generate` first.

To try the real, authenticated workspace (sign up, run a sample scan, open
cases, invite teammates) on a fresh checkout, copy the environment file and
set a session secret:

```bash
cp .env.example .env
```

then set `SESSION_SECRET` in `.env` to any long random string. Everything
else in `.env.example` is optional today — see `ARCHITECTURE.md` →
"Environment configuration" for what each variable does and whether
anything currently reads it.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build (`next build`) |
| `npm start` | Serve a production build |
| `npm run lint` | ESLint |
| `npm test` | Run the test suite (Node's built-in test runner via `tsx`) |
| `npm run db:migrate` | `prisma migrate dev` — needs a real `DATABASE_URL` and a working `prisma generate`; not usable until both are in place (see above) |
| `npm run db:push` | `prisma db push` — syncs the schema to whatever Postgres connection is configured, no migration history needed; what production actually runs, on every build |

## Current status

Every domain — auth, connectors, music identification, the rights engine,
campaigns, cases, notifications, billing — is fully built and tested
end-to-end: real business logic, real UI, real tests. Four of those domains
are now backed by a real Postgres database on Neon — auth, billing,
notifications, and audit — verified in production with a real signup →
dashboard → logout → login round-trip, not just a successful build. The
rest (connectors, music identification, the rights engine, campaigns,
cases) still run against in-memory or fixture repositories, written to be a
drop-in-compatible swap for a Prisma-backed one the same way the four above
already were. The real TikTok connector is separately blocked — on TikTok
API access, not an engineering decision — so the app runs against a mock
connector until then.

`ARCHITECTURE.md` has the full picture: what's built, what's blocked and on
what, and what's deliberately left out of scope for now.

## Project structure

- `src/app/` — Next.js App Router routes: Demo Mode (`/`, `/dashboard`,
  `/creators`, `/assessments/*`) and the real workspace (`/workspace/*`,
  `/login`, `/signup`, `/invite/accept`).
- `src/modules/` — domain logic, independent of Next.js: connectors, music
  identification, the rights engine, campaigns, cases, notifications,
  billing, auth. Each depends only on its own repository/provider
  interfaces, never a concrete storage technology — see `ARCHITECTURE.md` →
  "Module-layer architecture".
- `src/components/` — shared UI, documented in `DESIGN_SYSTEM.md`.
- `prisma/schema.prisma` — the data model; see `ARCHITECTURE.md` →
  "Database architecture" for its current status.
