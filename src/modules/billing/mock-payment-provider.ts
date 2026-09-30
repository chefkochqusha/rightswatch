import { randomUUID } from "node:crypto";
import type { PaymentProvider, PlanTier } from "./types";

/**
 * 14-day trial length is a reasonable default (a common SaaS norm), not a
 * figure from the Brief. Exported (not a private local) so
 * `StripePaymentProvider` uses the exact same number — a workspace
 * shouldn't get a different trial length depending on which payment
 * backend happens to be wired in.
 */
export const TRIAL_LENGTH_DAYS = 14;

/**
 * Stands in for a real `StripePaymentProvider` (see `types.ts` for why one
 * wasn't built until now, and `stripe-payment-provider.ts` for the real
 * one). Every id is prefixed `_mock_` so it can never be mistaken for a
 * real Stripe id if it ever leaked into a log or a support ticket. No
 * network calls, no card collection — this is enough to drive a genuine
 * subscription lifecycle (create, change plan, cancel) end to end, the
 * same way `MockTikTokConnector` drives a genuine scan pipeline.
 *
 * There's no real payment collection here to make a trial-vs-paid
 * distinction meaningful beyond the label the UI shows.
 */
export class MockPaymentProvider implements PaymentProvider {
  async createCustomer(_input: { email: string; workspaceId: string }): Promise<{ customerId: string }> {
    return { customerId: `cus_mock_${randomUUID()}` };
  }

  async createSubscription(_input: {
    customerId: string;
    planTier: PlanTier;
  }): Promise<{ subscriptionId: string; currentPeriodEnd: Date }> {
    const currentPeriodEnd = new Date(Date.now() + TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000);
    return { subscriptionId: `sub_mock_${randomUUID()}`, currentPeriodEnd };
  }

  async changeSubscriptionPlan(_input: { subscriptionId: string; planTier: PlanTier }): Promise<void> {
    // No-op: nothing to simulate beyond "the call succeeded." Real Stripe
    // would prorate and return the updated Subscription object, but this
    // mock deliberately doesn't model proration (see PaymentProvider's
    // doc comment) — the caller keeps the existing currentPeriodEnd.
  }

  async cancelSubscription(_subscriptionId: string): Promise<void> {
    // No-op for the same reason.
  }

  /** Any stored id: the mock never looks at the customer it's handed, so
   *  there's nothing it can't "bill" (see `PaymentProvider.canReuseCustomer`). */
  canReuseCustomer(_customerId: string): boolean {
    return true;
  }
}
