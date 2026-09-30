import Stripe from "stripe";
import { TRIAL_LENGTH_DAYS } from "./mock-payment-provider";
import type { PaymentProvider, PlanTier } from "./types";

/**
 * The real `PaymentProvider` (Phase 2/Stripe test mode — Brief §18–20). Same
 * role and same drop-in-replacement contract `types.ts`'s `PaymentProvider`
 * doc comment describes: `subscribe-workspace.ts`/`cancel-subscription.ts`
 * need zero changes to use this instead of `MockPaymentProvider`, only a
 * different `paymentProvider` passed into their `deps`.
 *
 * Not wired into `app/_lib/billing-store.ts` yet — that's a separate,
 * deliberate cutover step (same two-step pattern Prisma's repositories
 * followed: write the adapter, verify it compiles, then flip the store to
 * use it) that happens once real Stripe test-mode keys actually exist. This
 * sandbox has no route to `api.stripe.com` either way, so nothing here can
 * be exercised against real Stripe from here — verification is `tsc`/
 * `eslint` clean now, and a real checkout/plan-change/cancel round-trip on
 * Vercel once keys are configured, the same bar Prisma's cutover used for
 * the one thing this sandbox structurally can't do itself.
 *
 * No `*.test.ts` sibling, matching every other real-backend adapter in this
 * codebase (`modules/*\/prisma-repositories.ts`): a thin wrapper around a
 * paid external API has nothing to usefully unit-test without either a live
 * connection or a hand-rolled fake SDK this project doesn't otherwise use.
 *
 * `getStripeClient()`, not a top-level `export const stripe`: mirrors
 * `getPrisma()`'s reasoning even though the underlying risk is smaller here
 * (the `stripe` package itself has no import-time side effects and doesn't
 * crash this sandbox to merely import) — but constructing a real client
 * with no `STRIPE_SECRET_KEY` set should fail the moment someone tries to
 * use it, not the moment some unrelated file happens to import this module.
 */

const globalForStripe = globalThis as unknown as { __rightswatchStripe?: Stripe };

function getStripeClient(): Stripe {
  if (globalForStripe.__rightswatchStripe) {
    return globalForStripe.__rightswatchStripe;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set — StripePaymentProvider needs a real Stripe " +
        "test-mode secret key before it can be used.",
    );
  }

  // No explicit `apiVersion` pin: the installed `stripe` package version is
  // itself the pin (each SDK release is tied to one default API version),
  // so upgrading the SDK is the only way this ever moves, and a stray wrong
  // version string here can't silently drift out of sync with it. Current
  // as of this SDK version: subscription billing periods live on each
  // `SubscriptionItem`, not on the `Subscription` itself — Stripe removed
  // `Subscription.current_period_end` in the 2025-03-31 ("basil") API
  // version (see `subscriptionItemPeriodEnd` below); this codebase never
  // held code written against the older shape, so there's no migration to
  // do, just a fact worth recording so a future reader isn't misled by
  // older Stripe examples/tutorials that still reference the removed field.
  const client = new Stripe(secretKey);
  globalForStripe.__rightswatchStripe = client;
  return client;
}

/**
 * Stripe bills by Price, not by an app-defined `PlanTier` string — a real
 * integration needs a test-mode Product/Price created in the Stripe
 * dashboard for each tier first, with its id set here. Env vars, not a
 * schema column: `Plan` is a small, static, seeded catalog (see
 * `plan-catalog.ts`'s doc comment), and adding a Stripe-specific column to
 * the schema for three fixed rows would be a bigger, harder-to-undo change
 * than three env vars for the same fact — consistent with how
 * `TIKTOK_CLIENT_KEY`/`_SECRET` are configured.
 */
const STRIPE_PRICE_ID_ENV_VAR: Record<PlanTier, string> = {
  STARTER: "STRIPE_PRICE_ID_STARTER",
  GROWTH: "STRIPE_PRICE_ID_GROWTH",
  AGENCY: "STRIPE_PRICE_ID_AGENCY",
};

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

/** See the module doc comment: removed from `Subscription` itself as of the
 *  Stripe "basil" API version (2025-03-31) and moved here. This app only
 *  ever puts one Price on a subscription (one plan per workspace, no
 *  add-ons), so the first item is always the right one. */
function subscriptionItemPeriodEnd(subscription: Stripe.Subscription): Date {
  const item = subscription.items.data[0];
  if (!item) {
    throw new Error(`Stripe subscription ${subscription.id} has no subscription items`);
  }
  return new Date(item.current_period_end * 1000);
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
    // uses Stripe's own default rather than an invented policy.
    await stripe.subscriptions.update(input.subscriptionId, {
      items: [{ id: itemId, price: getPriceId(input.planTier) }],
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await getStripeClient().subscriptions.cancel(subscriptionId);
  }
}
