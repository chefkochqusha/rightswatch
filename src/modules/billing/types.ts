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

import type { BillingInterval } from "./loyalty";

export type { BillingInterval };

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
  billingInterval: BillingInterval;
  /** Start of loyalty month 1 (the end of the free trial); see `loyalty.ts`. */
  loyaltyStartedAt: Date | null;
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
  /**
   * How a Stripe webhook finds the row an event is about. Keyed on the
   * subscription id, never the customer id: a workspace that cancels and
   * resubscribes keeps its customer but gets a new Stripe subscription, so
   * a late event about the old one must match nothing rather than
   * overwrite the new one (see `stripe-subscription-sync.ts`).
   */
  findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<SubscriptionRecord | null>;
  create(input: {
    workspaceId: string;
    planId: string;
    status: SubscriptionStatus;
    stripeCustomerId: string;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: Date | null;
    billingInterval?: BillingInterval;
    loyaltyStartedAt?: Date | null;
  }): Promise<SubscriptionRecord>;
  /** `stripeCustomerId` is updatable only for one case: a workspace whose
   *  stored customer the current payment provider can't bill (a demo-era
   *  `cus_mock_…` id after the switch to Stripe) gets a fresh one on its
   *  next subscribe — see `PaymentProvider.canReuseCustomer`. */
  update(
    id: string,
    changes: Partial<
      Pick<
        SubscriptionRecord,
        "planId" | "status" | "stripeCustomerId" | "stripeSubscriptionId" | "currentPeriodEnd" | "billingInterval" | "loyaltyStartedAt"
      >
    >,
  ): Promise<SubscriptionRecord>;
}

/**
 * The payment-gateway adapter boundary — same role `PlatformConnector`
 * plays for TikTok. Two implementations: `MockPaymentProvider` (demo
 * billing, no network, no real money) and `StripePaymentProvider` (Stripe
 * test mode). `app/_lib/billing-store.ts` picks between them from the
 * environment (`payment-provider-selection.ts`), so `subscribe-workspace.ts`
 * / `cancel-subscription.ts` never know which one they're talking to.
 *
 * Deliberately synchronous-looking: each call returns what the caller needs
 * to persist right away. Anything Stripe changes on its own afterwards (a
 * trial ending, a failed payment, a cancellation from the Customer Portal)
 * reaches the database through the webhook instead
 * (`handle-stripe-webhook.ts`) — Master Brief §18: "Stripe webhook events
 * must update the internal subscription state."
 */
export interface PaymentProvider {
  createCustomer(input: { email: string; workspaceId: string }): Promise<{ customerId: string }>;
  createSubscription(input: {
    customerId: string;
    planTier: PlanTier;
    interval?: BillingInterval;
  }): Promise<{ subscriptionId: string; currentPeriodEnd: Date }>;
  /** No return value: this mock doesn't model proration, so a plan change
   *  never alters `currentPeriodEnd` — the caller keeps the existing one. */
  changeSubscriptionPlan(input: { subscriptionId: string; planTier: PlanTier; interval?: BillingInterval }): Promise<void>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  /**
   * Whether a customer id already stored on a workspace's subscription can
   * be billed by *this* provider. `subscribeWorkspace` reuses it on a
   * resubscribe when it can, and creates a fresh customer when it can't.
   *
   * The case this exists for: a workspace that subscribed under demo
   * billing keeps a `cus_mock_…` id that real Stripe has never seen. Once
   * the app runs on Stripe, cancelling and starting a new trial must create
   * a real Stripe customer — not hand the mock id to Stripe (a 404), and
   * not quietly keep the workspace on demo billing forever.
   */
  canReuseCustomer(customerId: string): boolean;
}
