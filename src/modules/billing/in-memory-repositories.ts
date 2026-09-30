import type { PlanRecord, PlanRepository, SubscriptionRecord, SubscriptionRepository } from "./types";
import { PLAN_CATALOG } from "./plan-catalog";

/**
 * Read-only over the static catalog — there's no `create`/`update` here on
 * purpose, matching `PlanRepository`'s interface exactly (a real
 * Prisma-backed implementation would still only ever be seeded, never
 * written to from application code).
 */
export class InMemoryPlanRepository implements PlanRepository {
  private readonly plans: PlanRecord[];

  constructor(plans: readonly PlanRecord[] = PLAN_CATALOG) {
    this.plans = [...plans];
  }

  async findByTier(tier: PlanRecord["tier"]): Promise<PlanRecord | null> {
    return this.plans.find((plan) => plan.tier === tier) ?? null;
  }

  async findById(id: string): Promise<PlanRecord | null> {
    return this.plans.find((plan) => plan.id === id) ?? null;
  }

  async findAll(): Promise<PlanRecord[]> {
    return [...this.plans];
  }
}

let subscriptionSequence = 0;

export class InMemorySubscriptionRepository implements SubscriptionRepository {
  private readonly byId = new Map<string, SubscriptionRecord>();
  private readonly idByWorkspaceId = new Map<string, string>();

  async findByWorkspaceId(workspaceId: string): Promise<SubscriptionRecord | null> {
    const id = this.idByWorkspaceId.get(workspaceId);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<SubscriptionRecord | null> {
    for (const record of this.byId.values()) {
      if (record.stripeSubscriptionId === stripeSubscriptionId) return record;
    }
    return null;
  }

  async create(input: {
    workspaceId: string;
    planId: string;
    status: SubscriptionRecord["status"];
    stripeCustomerId: string;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: Date | null;
  }): Promise<SubscriptionRecord> {
    if (this.idByWorkspaceId.has(input.workspaceId)) {
      // Subscription.workspaceId is @unique in the schema — mirror that
      // here rather than silently creating a second row.
      throw new Error(`Workspace ${input.workspaceId} already has a subscription.`);
    }
    subscriptionSequence += 1;
    const now = new Date();
    const record: SubscriptionRecord = {
      id: `subscription-${subscriptionSequence}`,
      workspaceId: input.workspaceId,
      planId: input.planId,
      status: input.status,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      currentPeriodEnd: input.currentPeriodEnd,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(record.id, record);
    this.idByWorkspaceId.set(input.workspaceId, record.id);
    return record;
  }

  async update(
    id: string,
    changes: Partial<
      Pick<
        SubscriptionRecord,
        "planId" | "status" | "stripeCustomerId" | "stripeSubscriptionId" | "currentPeriodEnd"
      >
    >,
  ): Promise<SubscriptionRecord> {
    const existing = this.byId.get(id);
    if (!existing) {
      throw new Error(`Subscription ${id} does not exist.`);
    }
    const updated: SubscriptionRecord = { ...existing, ...changes, updatedAt: new Date() };
    this.byId.set(id, updated);
    return updated;
  }
}
