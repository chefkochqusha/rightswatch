/**
 * Billing (Master Brief §18–20, schema comment on `prisma/schema.prisma`).
 * Field names mirror the `Plan` and `Subscription` Prisma models exactly —
 * same drop-in-replacement pattern as every other module here.
 *
 * Deliberately out of scope for now: `PlanEntitlement` (flexible per-plan
 * feature flags) and `UsageRecord` (periodic usage snapshots). Both exist
 * in the schema, but nothing in this codebase has a concrete entitlement
 * key or a billing-period usage rollup to populate them with yet — the one
 * usage figure the UI actually needs (tracked creators vs. `creatorCap`)
 * is read live off `workspace-scan-store.ts` instead of a stored snapshot.
 * Building either now would be speculative scope, not a real requirement.
 */

export type PlanTier = "STARTER" | "GROWTH" | "AGENCY";

export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED";

export interface PlanRecord {
  id: string;
  tier: PlanTier;
  name: string;
  priceCents: number;
  creatorCap: number;
  /** "daily" | "every_6h" | "configurable" (schema comment's own examples —
   *  backend config, never hardcoded in the UI). */
  scanCadence: string;
}

export interface SubscriptionRecord {
  id: string;
  workspaceId: string;
  planId: string;
  status: SubscriptionStatus;
  stripeCustomerId: string;
  /** `null` only in the moment between creating a payment-provider customer
   *  and creating its first subscription — every persisted record in
   *  practice has one, since `subscribeWorkspace` creates both together. */
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanRepository {
  findByTier(tier: PlanTier): Promise<PlanRecord | null>;
  findById(id: string): Promise<PlanRecord | null>;
  findAll(): Promise<PlanRecord[]>;
}

export interface SubscriptionRepository {
  findByWorkspaceId(workspaceId: string): Promise<SubscriptionRecord | null>;
  create(input: {
    workspaceId: string;
    planId: string;
    status: SubscriptionStatus;
    stripeCustomerId: string;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: Date | null;
  }): Promise<SubscriptionRecord>;
  update(
    id: string,
    changes: Partial<
      Pick<
        SubscriptionRecord,
        "planId" | "status" | "stripeSubscriptionId" | "currentPeriodEnd"
      >
    >,
  ): Promise<SubscriptionRecord>;
}

/**
 * The Stripe adapter boundary — same role `PlatformConnector` plays for
 * TikTok. This sandbox has no route to api.stripe.com and no real Stripe
 * keys (`STRIPE_SECRET_KEY` is blank in `.env.example`, never provisioned),
 * the same category of block as the real TikTok connector (Phase 10) and
 * Prisma (network-restricted) — so a `StripePaymentProvider` isn't built
 * yet, but everything downstream (the subscription lifecycle, the billing
 * UI) is real and works against `MockPaymentProvider` today, and swaps to
 * a real implementation with zero changes to `subscribe-workspace.ts` /
 * `cancel-subscription.ts` once real keys exist.
 */
export interface PaymentProvider {
  createCustomer(input: { email: string; workspaceId: string }): Promise<{ customerId: string }>;
  createSubscription(input: {
    customerId: string;
    planTier: PlanTier;
  }): Promise<{ subscriptionId: string; currentPeriodEnd: Date }>;
  /** No return value: this mock doesn't model proration, so a plan change
   *  never alters `currentPeriodEnd` — the caller keeps the existing one. */
  changeSubscriptionPlan(input: { subscriptionId: string; planTier: PlanTier }): Promise<void>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}
