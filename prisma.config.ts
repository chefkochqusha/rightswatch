import { defineConfig } from "prisma/config";

/**
 * Prisma 7 moved the datasource connection string out of `schema.prisma`
 * (a `url = env(...)` line there is now a hard validation error, P1012) and
 * into this file instead. `prisma generate` reads it to resolve the
 * datasource's provider/url pair; `prisma migrate`/`db push` use the same
 * value to actually reach the database.
 *
 * Neon is now provisioned (Phase 2), connected through Vercel's storage
 * marketplace rather than by hand — that integration injects its own set
 * of env vars prefixed with the storage resource's name (`storagee_*`)
 * instead of touching the pre-existing `DATABASE_URL` placeholder.
 * `storagee_DATABASE_URL_UNPOOLED` is the direct (non-PgBouncer) connection
 * — the right one for the CLI here, since `migrate`/`db push` run DDL and
 * use advisory locks that a transaction-pooled connection can break. The
 * runtime `PrismaClient` (see `src/lib/prisma-client.ts`) deliberately uses
 * the *pooled* var instead, for the opposite reason.
 *
 * Falls back to the plain `DATABASE_URL` placeholder so a local Postgres
 * (no pooler in front of it, so "unpooled" is moot) still works by just
 * setting that one var, per `.env.example`.
 *
 * Why `db push` runs on every build (`package.json`'s `build` script) and
 * not `migrate dev`/`migrate deploy` with committed migration files: both
 * need a live Postgres to generate the initial migration SQL from (`migrate
 * dev` also needs a *shadow* database), and no environment this project has
 * had access to so far can reach one outside of Vercel's own build step —
 * this sandbox's outbound network is restricted to package registries and
 * GitHub (see AGENTS.md/the environment notes), not arbitrary Postgres
 * hosts. `db push` only needs the schema file and a live connection at
 * build time, which Vercel's build has, so it's the one schema-sync path
 * that actually works given that constraint — deliberately run without
 * `--accept-data-loss`, so it fails the build loudly on any destructive
 * change instead of silently applying it. Revisit once there's a real CI
 * environment (or local dev machine) with direct Postgres access, and
 * switch to versioned migrations then.
 */
export default defineConfig({
  datasource: {
    url: process.env.storagee_DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!,
  },
  // Prisma 7 seeding is CLI-only and never automatic (no more auto-run
  // after `migrate dev`/`reset`) — see `prisma/seed.ts` for what this
  // seeds and why it's safe to run on every build.
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
