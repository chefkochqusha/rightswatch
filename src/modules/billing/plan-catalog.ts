import type { PlanRecord } from "./types";

/**
 * The fixed plan catalog. Unlike every other repository in this codebase,
 * plans aren't user- or workspace-created data — they're a small, static
 * price list the business defines, so a hardcoded catalog (seeded into
 * `InMemoryPlanRepository`, and later a Prisma migration/seed script) is
 * the right shape, not "yet another mutable collection."
 *
 * Fixed ids (not random) so tests and demo data can reference a plan by a
 * stable slug, the same reasoning as `DEMO_CREATORS`' fixed ids.
 */
export const PLAN_CATALOG: readonly PlanRecord[] = [
  {
    id: "plan-starter",
    tier: "STARTER",
    name: "Starter",
    priceCents: 9_900,
    creatorCap: 50,
    scanCadence: "daily",
  },
  {
    id: "plan-growth",
    tier: "GROWTH",
    name: "Growth",
    priceCents: 29_900,
    creatorCap: 500,
    scanCadence: "every_6h",
  },
  {
    id: "plan-agency",
    tier: "AGENCY",
    name: "Agency",
    priceCents: 99_900,
    creatorCap: 2_500,
    scanCadence: "configurable",
  },
] as const;
