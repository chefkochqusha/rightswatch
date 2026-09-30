import { getStripeClient, subscriptionItemPeriodEnd } from "@/lib/stripe-client";
import { TRIAL_LENGTH_DAYS } from "./mock-payment-provider";
import { STRIPE_PRICE_ID_ENV_VAR, isMockCustomerId } from "./payment-provider-selection";
import type { PaymentProvider, PlanTier } from "./types";

/**
 * The real `PaymentProvider` (Stripe test mode — Brief §18–20). Same role
 * and same drop-in-replacement contract `types.ts`'s `PaymentProvider` doc
 * comment describes: `subscribe-workspace.ts`/`cancel-subscription.ts`
 * need zero changes to use this instead of `MockPaymentProvider`, only a
 * different `paymentProvider` passed into their `deps`.
 *
 * Selected automatically by `app/_lib/billing-store.ts` once
 * `isStripeConfigured()` (`payment-provider-selection.ts`) sees every env
 * var it needs — never hand-wired, so setting real keys in Vercel is the
 * whole cutover. This sandbox has no route to `api.stripe.com`, so nothing
 * here can be exercised against real Stripe from here; verification is
 * `tsc`/`eslint` clean now, and a real subscribe/change-plan/cancel
 * round-trip on Vercel once keys exist — the same bar Prisma's cutover
 * used for the one thing this sandbox structurally can't do itself.
 *
 * No `*.test.ts` sibling, matching every other real-backend adapter in this
 * codebase (`modules/*\/prisma-repositories.ts`): a thin wrapper around a
 * paid external API has nothing to usefully unit-test without either a live
 * connection or a hand-rolled fake SDK this project doesn't otherwise use.
 * The logic around it that *is* testable without Stripe — which provider to
 * pick, which one a given id belongs to, how a Stripe status maps onto
 * ours — lives in its own, tested files.
 */

/**
 * Stripe bills by Price, not by an app-defined `PlanTier` string — a real
 * integration needs a test-mode Product/Price created in the Stripe
 * dashboard for each tier first, with its id in the matching env var
 * (`STRIPE_PRICE_ID_ENV_VAR`, `payment-provider-selection.ts`). Env vars,
 * not a schema column: `Plan` is a small, static, seeded catalog (see
 * `plan-catalog.ts`'s doc comment), and adding a Stripe-specific column to
 * the schema for three fixed rows would be a bigger, harder-to-undo change
 * than three env vars for the same fact — consistent with how
 * `TIKTOK_CLIENT_KEY`/`_SECRET` are configured.
 */
function getPriceId(tier: PlanTier): string {
  const envVar = STRIPE_PRICE_ID_ENV_VAR[tier];
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new Error(
      `${envVar} is not set — create a matching test-mode Price in the Stripe ` +
        `dashboard for the ${tier} plan and set its id in this env var.`,
    );
  }
  return priceId;
}

export class StripePaymentProvider implements PaymentProvider {
  async createCustomer(input: { email: string; workspaceId: string }): Promise<{ customerId: string }> {
    const customer = await getStripeClient().customers.create({
      email: input.email,
      // Lets a workspace's Stripe customer be found from the dashboard by
      // the id our own database already keys everything else on.
      metadata: { workspaceId: input.workspaceId },
    });
    return { customerId: customer.id };
  }

  async createSubscription(input: {
    customerId: string;
    planTier: PlanTier;
  }): Promise<{ subscriptionId: string; currentPeriodEnd: Date }> {
    const subscription = await getStripeClient().subscriptions.create({
      customer: input.customerId,
      items: [{ price: getPriceId(input.planTier) }],
      trial_period_days: TRIAL_LENGTH_DAYS,
      // The trial starts without a card (same as the mock). Stripe's default
      // for a trial that ends with no payment method on file is to invoice
      // anyway and start dunning an invoice that can't be paid — the
      // customer gets failed-payment emails for a card they never gave.
      // "cancel" ends the subscription cleanly instead (the webhook syncs it
      // to CANCELED), and adding a card in the Customer Portal before the
      // trial ends is what keeps it running. No surprise charges, no
      // pressure tactics (Master Brief §57: "Avoid dark patterns").
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
    });
    return {
      subscriptionId: subscription.id,
      currentPeriodEnd: subscriptionItemPeriodEnd(subscription),
    };
  }

  async changeSubscriptionPlan(input: { subscriptionId: string; planTier: PlanTier }): Promise<void> {
    const stripe = getStripeClient();
    // Need the existing subscription item's id to *replace* its price
    // in-place, rather than adding a second item alongside it.
    const subscription = await stripe.subscriptions.retrieve(input.subscriptionId);
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) {
      throw new Error(`Stripe subscription ${input.subscriptionId} has no subscription items to update`);
    }
    // No explicit `proration_behavior`: Stripe's own default
    // (`create_prorations`) charges/credits the difference for the rest of
    // the current period without resetting the billing anchor, so — like
    // the mock — `currentPeriodEnd` doesn't change from a plan switch alone
    // (see `PaymentProvider`'s doc comment in `types.ts`). Whether upgrades
    // should prorate at all isn't specified anywhere in the Brief, so this
    // uses Stripe's own default rather than an invented policy. The Stripe
    // webhook (`stripe-subscription-sync.ts`) re-syncs `currentPeriodEnd`
    // from Stripe regardless, so the stored value can't drift even if that
    // assumption ever stops holding.
    await stripe.subscriptions.update(input.subscriptionId, {
      items: [{ id: itemId, price: getPriceId(input.planTier) }],
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await getStripeClient().subscriptions.cancel(subscriptionId);
  }

  /** Any real Stripe customer; never a demo-era `cus_mock_…` id, which
   *  Stripe has never seen (see `PaymentProvider.canReuseCustomer`). */
  canReuseCustomer(customerId: string): boolean {
    return !isMockCustomerId(customerId);
  }
}
