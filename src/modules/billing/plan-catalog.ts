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
    // An independent artist or a small label: a handful of creators, their own songs.
    id: "plan-solo",
    tier: "SOLO",
    name: "Solo",
    priceCents: 2_900,
    creatorCap: 10,
    scanCadence: "daily",
    seatCap: 1,
    referenceSongCap: 25,
  },
  {
    id: "plan-starter",
    tier: "STARTER",
    name: "Starter",
    priceCents: 9_900,
    creatorCap: 50,
    scanCadence: "daily",
    seatCap: 3,
    referenceSongCap: 200,
  },
  {
    id: "plan-growth",
    tier: "GROWTH",
    name: "Growth",
    priceCents: 29_900,
    creatorCap: 500,
    scanCadence: "every_6h",
    seatCap: 10,
    referenceSongCap: 2_000,
  },
  {
    id: "plan-agency",
    tier: "AGENCY",
    name: "Agency",
    priceCents: 99_900,
    creatorCap: 2_500,
    scanCadence: "configurable",
    seatCap: 30,
    referenceSongCap: 20_000,
  },
] as const;

/** Bigger than Agency (catalogues, own server, contract terms): priced per
 *  customer, not self-serve, so not a `PlanTier`. Shown on the pricing page. */
export const ENTERPRISE_OFFER = {
  name: "Enterprise",
  fromPriceCents: 250_000,
  points: [
    "More than 2,500 creators and 20,000 songs",
    "Bekvor on your own server, if you want it in-house",
    "Your contract, data processing terms and invoicing",
    "A named contact and onboarding for your team",
  ],
} as const;
