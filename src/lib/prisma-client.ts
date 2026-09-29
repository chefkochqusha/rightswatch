import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/**
 * Runtime `PrismaClient` singleton (Phase 2). Prisma 7's client is
 * "Rust-free" — it no longer reads `DATABASE_URL` (or anything else) from
 * the environment on its own, and `new PrismaClient()` with no arguments
 * throws. It must be handed an explicit driver adapter that knows how to
 * actually run SQL; `prisma.config.ts` covers the *separate* CLI connection
 * string (`generate`/`migrate`/`db push`), which is not read here.
 *
 * Connection string: Vercel's Neon marketplace integration injected its
 * own env vars prefixed with the storage resource's name (`storagee_*`)
 * rather than touching the pre-existing `DATABASE_URL` placeholder — see
 * `prisma.config.ts` for the same situation. `storagee_POSTGRES_PRISMA_URL`
 * is Neon/Vercel's pooled (PgBouncer) connection string, pre-tuned for
 * Prisma. Pooled is the right choice *here* (unlike the CLI config, which
 * uses the unpooled var) because this client is constructed fresh in each
 * serverless function invocation — pooling is what stops many concurrent
 * invocations from exhausting Postgres' own connection limit.
 *
 * Falls back to the plain `DATABASE_URL` placeholder for local dev against
 * a plain (non-Neon) Postgres, where there's no pooler in front of it to
 * prefer over the direct URL anyway.
 */
const connectionString = process.env.storagee_POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "No database connection string configured. Set storagee_POSTGRES_PRISMA_URL " +
      "(Neon via Vercel) or DATABASE_URL (local Postgres) before importing `prisma`.",
  );
}

function createPrismaClient(): PrismaClient {
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

// Cached on `globalThis` so `next dev`'s module-reload-on-save doesn't open
// a fresh connection pool on every edit — same convention as every
// `getXStore()` in `app/_lib/` (see e.g. `auth-store.ts`), just for the one
// thing here that isn't module-scoped state but an actual network resource.
const globalForPrisma = globalThis as unknown as { __rightswatchPrisma?: PrismaClient };

export const prisma = globalForPrisma.__rightswatchPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__rightswatchPrisma = prisma;
}
