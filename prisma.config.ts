import { defineConfig } from "prisma/config";

/**
 * Prisma 7 moved the datasource connection string out of `schema.prisma`
 * (a `url = env(...)` line there is now a hard validation error, P1012) and
 * into this file instead. `prisma generate` reads it to resolve the
 * datasource's provider/url pair; `prisma migrate`/`db push` (Phase 2, once
 * Neon is provisioned) will use the same value.
 *
 * `DATABASE_URL` isn't read here for the *runtime* `PrismaClient` at all —
 * that's a separate concern (a driver adapter passed to `new PrismaClient()`
 * per Prisma 7's docs) that doesn't exist yet, since every repository in
 * this codebase is still in-memory/fixture-backed (see ARCHITECTURE.md).
 * This file exists purely so the CLI (and its `postinstall: prisma
 * generate` hook) has a valid config to read.
 */
export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
