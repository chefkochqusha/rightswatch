import { prisma } from "@/lib/prisma-client";
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
 * exactly. Not yet wired into `app/_lib/billing-store.ts`: that swap
 * happens once Neon's initial schema push is confirmed live.
 * `MockPaymentProvider` has no Prisma equivalent — Stripe isn't wired up
 * yet, see `types.ts`'s `PaymentProvider` comment.
 *
 * `Plan` is seeded, never written by application code (see `types.ts`'s
 * own comment on `PlanRepository`) — the seed script/mechanism for the
 * static plan catalog (`plan-catalog.ts`) is separate follow-up work, not
 * part of this repository class.
 */

// Same representation-bridging rationale as `modules/auth/prisma-
// repositories.ts`'s `PrismaRole` helpers — `PlanTier` and
// `SubscriptionStatus` are the other two schema enums this module touches,
// and this sandbox can't run `prisma generate` to see whether Prisma 7
// generated them as nominal TS enums or plain string unions.
type PrismaPlanTier = Parameters<typeof prisma.plan.findUnique>[0]["where"]["tier"] & string;
function toPrismaPlanTier(tier: PlanTier): PrismaPlanTier {
  return tier as PrismaPlanTier;
}
function fromPrismaPlanTier(tier: string): PlanTier {
  return tier as PlanTier;
}

type PrismaSubscriptionStatus = Parameters<typeof prisma.subscription.create>[0]["data"]["status"] & string;
function toPrismaSubscriptionStatus(status: SubscriptionStatus): PrismaSubscriptionStatus {
  return status as PrismaSubscriptionStatus;
}
function fromPrismaSubscriptionStatus(status: string): SubscriptionStatus {
  return status as SubscriptionStatus;
}

export class PrismaPlanRepository implements PlanRepository {
  async findByTier(tier: PlanTier): Promise<PlanRecord | null> {
    const row = await prisma.plan.findUnique({ where: { tier: toPrismaPlanTier(tier) } });
    return row ? mapPlan(row) : null;
  }

  async findById(id: string): Promise<PlanRecord | null> {
    const row = await prisma.plan.findUnique({ where: { id } });
    return row ? mapPlan(row) : null;
  }

  async findAll(): Promise<PlanRecord[]> {
    const rows = await prisma.plan.findMany();
    return rows.map(mapPlan);
  }
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  async findByWorkspaceId(workspaceId: string): Promise<SubscriptionRecord | null> {
    const row = await prisma.subscription.findUnique({ where: { workspaceId } });
    return row ? mapSubscription(row) : null;
  }

  async create(input: {
    workspaceId: string;
    planId: string;
    status: SubscriptionStatus;
    stripeCustomerId: string;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: Date | null;
  }): Promise<SubscriptionRecord> {
    // `Subscription.workspaceId` is `@unique` in the schema — a duplicate
    // create surfaces as Prisma's own P2002 constraint-violation error
    // rather than the in-memory repository's plain `Error` message. No
    // caller inspects that message today (`subscribe-workspace.ts` always
    // checks `findByWorkspaceId` first), so the difference is dormant.
    const row = await prisma.subscription.create({
      data: {
        workspaceId: input.workspaceId,
        planId: input.planId,
        status: toPrismaSubscriptionStatus(input.status),
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        currentPeriodEnd: input.currentPeriodEnd,
      },
    });
    return mapSubscription(row);
  }

  async update(
    id: string,
    changes: Partial<
      Pick<SubscriptionRecord, "planId" | "status" | "stripeSubscriptionId" | "currentPeriodEnd">
    >,
  ): Promise<SubscriptionRecord> {
    const row = await prisma.subscription.update({
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
}): PlanRecord {
  return {
    id: row.id,
    tier: fromPrismaPlanTier(row.tier),
    name: row.name,
    priceCents: row.priceCents,
    creatorCap: row.creatorCap,
    scanCadence: row.scanCadence,
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
