import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PLAN_CATALOG } from "../src/modules/billing/plan-catalog";

/**
 * Seeds the static `Plan` catalog (Master Brief §18–20 — see
 * `src/modules/billing/plan-catalog.ts` for why this is a hardcoded list,
 * not user/workspace data). Prisma 7 seeding is CLI-only and never
 * automatic (no more auto-run after `migrate dev`/`reset`) — this script
 * is wired up via `prisma.config.ts`'s `migrations.seed` and invoked
 * explicitly by `npm run build` (`prisma db seed`), right after `db push`.
 *
 * A standalone script, not `src/lib/prisma-client.ts`'s app singleton:
 * this runs as a short-lived CLI process, not inside a serverless
 * function, so it uses the same *unpooled* connection string
 * `prisma.config.ts` uses for the CLI, and manages its own `Pool`
 * lifecycle (closed at the end) rather than sharing the app's long-lived
 * one. Relative imports throughout (not the `@/` alias) since this runs
 * via a bare `tsx prisma/seed.ts`, outside Next.js's own module resolution.
 *
 * `upsert`, not `create`: this runs on every build (like `db push`), so it
 * must be safe to repeat — updates a plan already seeded rather than
 * failing on `Plan.tier`'s `@unique` constraint.
 */
const connectionString = process.env.storagee_DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "No database connection string configured. Set storagee_DATABASE_URL_UNPOOLED " +
      "(Neon via Vercel) or DATABASE_URL (local Postgres) before seeding.",
  );
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Same representation-bridging cast as `modules/billing/prisma-
// repositories.ts` — see that file for the full rationale.
type PrismaPlanTier = Parameters<typeof prisma.plan.upsert>[0]["where"]["tier"] & string;

async function main() {
  for (const plan of PLAN_CATALOG) {
    await prisma.plan.upsert({
      where: { tier: plan.tier as PrismaPlanTier },
      create: {
        id: plan.id,
        tier: plan.tier as PrismaPlanTier,
        name: plan.name,
        priceCents: plan.priceCents,
        creatorCap: plan.creatorCap,
        scanCadence: plan.scanCadence,
      },
      update: {
        name: plan.name,
        priceCents: plan.priceCents,
        creatorCap: plan.creatorCap,
        scanCadence: plan.scanCadence,
      },
    });
  }
  console.log(`Seeded ${PLAN_CATALOG.length} plans.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
