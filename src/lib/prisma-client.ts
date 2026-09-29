import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Runtime `PrismaClient` accessor (Phase 2). Prisma 7's client is
 * "Rust-free" — it no longer reads `DATABASE_URL` (or anything else) from
 * the environment on its own, and `new PrismaClient()` with no arguments
 * throws. It must be handed an explicit driver adapter that knows how to
 * actually run SQL; `prisma.config.ts` covers the *separate* CLI connection
 * string (`generate`/`db push`/`db seed`), which is not read here.
 *
 * Connection string: Vercel's Neon marketplace integration injected its
 * own env vars prefixed with the storage resource's name (`storagee_*`)
 * rather than touching the pre-existing `DATABASE_URL` placeholder — see
 * `prisma.config.ts` for the same situation. `storagee_POSTGRES_PRISMA_URL`
 * is Neon/Vercel's pooled (PgBouncer) connection string, pre-tuned for
 * Prisma. Pooled is the right choice *here* (unlike the CLI config, which
 * uses the unpooled var) because this client is constructed once per
 * server process and reused across many requests — pooling is what stops
 * many concurrent invocations from exhausting Postgres' own connection
 * limit. Falls back to the plain `DATABASE_URL` placeholder for local dev
 * against a plain (non-Neon) Postgres, where there's no pooler in front of
 * it to prefer over the direct URL anyway.
 *
 * `getPrisma()`, not a pre-built `export const prisma`: the generated
 * client, the driver adapter and `pg` are all loaded with `require`,
 * deferred until the first actual call, instead of a top-level `import`.
 * This isn't a style choice — it's required, found the hard way: every
 * `app/_lib/{audit,auth,billing,notification}-store.ts` imports its
 * Prisma-backed repository at module load time, and `workspace-scan-
 * store.ts` imports three of those stores at *its* module load time. A
 * top-level `import` here meant that merely importing
 * `workspace-scan-store.ts` — including from a test that only exercises
 * its two pure, storage-free helper functions — crashed immediately,
 * because the generated client (`src/generated/prisma`) doesn't exist in
 * this build sandbox (see `prisma.config.ts`'s history) and never will.
 * `require`, called lazily inside `getPrisma()`, defers that resolution to
 * the moment a Prisma-backed repository method actually runs, which never
 * happens for code this sandbox's tests exercise.
 */
const connectionString = process.env.storagee_POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as { __rightswatchPrisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (globalForPrisma.__rightswatchPrisma) {
    return globalForPrisma.__rightswatchPrisma;
  }

  if (!connectionString) {
    throw new Error(
      "No database connection string configured. Set storagee_POSTGRES_PRISMA_URL " +
        "(Neon via Vercel) or DATABASE_URL (local Postgres) before using the database.",
    );
  }

  /* eslint-disable @typescript-eslint/no-require-imports -- deferred on
     purpose; see the module doc comment above for why this can't be a
     top-level `import`. Relative paths throughout (not the `@/` alias),
     since a `require` call's argument is opaque to the bundler unless
     it's an unambiguous, statically-resolvable path. */
  const { PrismaClient: RealPrismaClient } = require("../generated/prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { Pool } = require("pg");
  /* eslint-enable @typescript-eslint/no-require-imports */

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const client: PrismaClient = new RealPrismaClient({ adapter });

  // Cached unconditionally (not just for `next dev`, unlike every
  // `getXStore()`'s in-memory Map): a connection pool should be reused
  // across warm serverless invocations within the same instance, not
  // rebuilt per request — a correctness/performance concern the in-memory
  // stores don't have.
  globalForPrisma.__rightswatchPrisma = client;
  return client;
}
