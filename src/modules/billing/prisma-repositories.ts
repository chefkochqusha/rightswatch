import { getPrisma } from "@/lib/prisma-client";
import type { PrismaClient } from "@/generated/prisma/client";
import type {
  PlanRecord,
  PlanRepository,
  PlanTier,
  SubscriptionRecord,
  SubscriptionRepository,
  SubscriptionStatus,
} from "./types";

/**
 * Prisma-backed repositories (Phase 2) for `Plan` and `Subscription` —
 * drop-in replacements for `InMemoryPlanRepository`/
 * `InMemorySubscriptionRepository`, matching `types.ts`'s interfaces
 * exactly. Wired into `app/_lib/billing-store.ts` now that Neon's schema
 * push is live. `MockPaymentProvider` has no Prisma equivalent — Stripe
 * isn't wired up yet, see `types.ts`'s `PaymentProvider` comment.
 *
 * `Plan` is seeded, never written by application code (see `types.ts`'s
 * own comment on `PlanRepository`) — see `prisma/seed.ts` for the seed
 * script that populates the static plan catalog (`plan-catalog.ts`), run
 * on every build.
 *
 * `getPrisma()`, not a top-level `prisma` binding — see
 * `src/lib/prisma-client.ts`'s doc comment for why.
 */

// Same representation-bridging rationale as `modules/auth/prisma-
// repositories.ts`'s `PrismaRole` helpers — `PlanTier` and
// `SubscriptionStatus` are the other two schema enums this module touches,
// and this sandbox can't run `prisma generate` to see whether Prisma 7
// generated them as nominal TS enums or plain string unions.
// `typeof getPrisma().plan.findUnique` won't parse — TypeScript's `typeof`
// type operator only accepts a dotted identifier chain, never a call
// expression like `getPrisma()`. Indexing the `PrismaClient` type directly
// (`PrismaClient["plan"]["findUnique"]`) parses fine but was verified
// (empirically, in this sandbox) to behave differently from the old
// `typeof prisma.plan.findUnique`: with the generated client absent here,
// TypeScript's error-recovery for the unresolvable import degrades a plain
// `typeof value.prop.prop` chain silently, but degrades a type-level index
// access into a spurious `Parameters<...>[0]["where"]`/`["data"]` "does not
// exist on type 'unknown'" error. A never-initialized `declare const` gives
// `typeof` a plain identifier to walk again, restoring the old, clean
// behavior — shared by both enum derivations below.
declare const _phantomPrismaClient: PrismaClient;
type PrismaPlanTier = Parameters<typeof _phantomPrismaClient.plan.findUnique>[0]["where"]["tier"] & string;
function toPrismaPlanTier(tier: PlanTier): PrismaPlanTier {
  return tier as PrismaPlanTier;
}
function fromPrismaPlanTier(tier: string): PlanTier {
  return tier as PlanTier;
}

type PrismaSubscriptionStatus = Parameters<typeof _phantomPrismaClient.subscription.create>[0]["data"]["status"] & string;
function toPrismaSubscriptionStatus(status: SubscriptionStatus): PrismaSubscriptionStatus {
  return status as PrismaSubscriptionStatus;
}
function fromPrismaSubscriptionStatus(status: string): SubscriptionStatus {
  return status as SubscriptionStatus;
}

export class PrismaPlanRepository implements PlanRepository {
  async findByTier(tier: PlanTier): Promise<PlanRecord | null> {
    const row = await getPrisma().plan.findUnique({ where: { tier: toPrismaPlanTier(tier) } });
    return row ? mapPlan(row) : null;
  }

  async findById(id: string): Promise<PlanRecord | null> {
    const row = await getPrisma().plan.findUnique({ where: { id } });
    return row ? mapPlan(row) : null;
  }

  async findAll(): Promise<PlanRecord[]> {
    const rows = await getPrisma().plan.findMany();
    return rows.map(mapPlan);
  }
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  async findByWorkspaceId(workspaceId: string): Promise<SubscriptionRecord | null> {
    const row = await getPrisma().subscription.findUnique({ where: { workspaceId } });
    return row ? mapSubscription(row) : null;
  }

  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<SubscriptionRecord | null> {
    // `stripeSubscriptionId` is `String? @unique` in the schema.
    const row = await getPrisma().subscription.findUnique({ where: { stripeSubscriptionId } });
    return row ? mapSubscription(row) : null;
  }

  async create(input: {
    workspaceId: string;
    planId: string;
    status: SubscriptionStatus;
    stripeCustomerId: string;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: Date | null;
    billingInterval?: SubscriptionRecord["billingInterval"];
    loyaltyStartedAt?: Date | null;
  }): Promise<SubscriptionRecord> {
    // `Subscription.workspaceId` is `@unique` in the schema — a duplicate
    // create surfaces as Prisma's own P2002 constraint-violation error
    // rather than the in-memory repository's plain `Error` message. No
    // caller inspects that message today (`subscribe-workspace.ts` always
    // checks `findByWorkspaceId` first), so the difference is dormant.
    const row = await getPrisma().subscription.create({
      data: {
        workspaceId: input.workspaceId,
        planId: input.planId,
        status: toPrismaSubscriptionStatus(input.status),
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        currentPeriodEnd: input.currentPeriodEnd,
        billingInterval: input.billingInterval ?? "MONTHLY",
        loyaltyStartedAt: input.loyaltyStartedAt ?? null,
      },
    });
    return mapSubscription(row);
  }

  async update(
    id: string,
    changes: Partial<
      Pick<
        SubscriptionRecord,
        "planId" | "status" | "stripeCustomerId" | "stripeSubscriptionId" | "currentPeriodEnd" | "billingInterval" | "loyaltyStartedAt"
      >
    >,
  ): Promise<SubscriptionRecord> {
    const row = await getPrisma().subscription.update({
      where: { id },
      data: {
        ...changes,
        status: changes.status ? toPrismaSubscriptionStatus(changes.status) : undefined,
      },
    });
    return mapSubscription(row);
  }
}

function mapPlan(row: {
  id: string;
  tier: string;
  name: string;
  priceCents: number;
  creatorCap: number;
  scanCadence: string;
  seatCap: number;
  referenceSongCap: number;
}): PlanRecord {
  return {
    id: row.id,
    tier: fromPrismaPlanTier(row.tier),
    name: row.name,
    priceCents: row.priceCents,
    creatorCap: row.creatorCap,
    scanCadence: row.scanCadence,
    seatCap: row.seatCap,
    referenceSongCap: row.referenceSongCap,
  };
}

function mapSubscription(row: {
  id: string;
  workspaceId: string;
  planId: string;
  status: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  billingInterval: string;
  loyaltyStartedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): SubscriptionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    planId: row.planId,
    status: fromPrismaSubscriptionStatus(row.status),
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    currentPeriodEnd: row.currentPeriodEnd,
    billingInterval: row.billingInterval === "ANNUAL" ? "ANNUAL" : "MONTHLY",
    loyaltyStartedAt: row.loyaltyStartedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
