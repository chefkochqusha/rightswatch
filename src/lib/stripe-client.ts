import Stripe from "stripe";

/**
 * Runtime Stripe client accessor, shared by `StripePaymentProvider`
 * (`modules/billing/stripe-payment-provider.ts`) and the Stripe webhook
 * route (`app/api/webhooks/stripe/route.ts`). Lives beside
 * `prisma-client.ts` for the same reason that file does: one lazily-built,
 * process-cached client for an external service, not one per caller.
 *
 * `getStripeClient()`, not a top-level `export const stripe`: importing the
 * `stripe` package itself has none of the generated Prisma client's
 * crash-at-load-time risk in this sandbox, but constructing a client with
 * no `STRIPE_SECRET_KEY` set should fail the moment someone actually uses
 * it, not the moment some unrelated file happens to import this module.
 *
 * No explicit `apiVersion` pin: the installed `stripe` package version is
 * itself the pin (each SDK release is tied to one default API version), so
 * upgrading the SDK is the only way this ever moves, and a stray version
 * string here can't silently drift out of sync with it. As of this SDK
 * version, billing periods live on each `SubscriptionItem`, not on the
 * `Subscription` — Stripe removed `Subscription.current_period_end` in the
 * 2025-03-31 ("basil") API version. Older Stripe examples and tutorials
 * that still read it off the subscription are wrong for this codebase.
 */
const globalForStripe = globalThis as unknown as { __rightswatchStripe?: Stripe };

export function getStripeClient(): Stripe {
  if (globalForStripe.__rightswatchStripe) {
    return globalForStripe.__rightswatchStripe;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set — a real Stripe test-mode secret key is " +
        "needed before anything that talks to Stripe can run.",
    );
  }

  const client = new Stripe(secretKey);
  globalForStripe.__rightswatchStripe = client;
  return client;
}

/** This app only ever puts one Price on a subscription (one plan per
 *  workspace, no add-ons), so the first item's billing period is the
 *  subscription's billing period. See the module doc comment for why this
 *  isn't `subscription.current_period_end`. */
export function subscriptionItemPeriodEnd(subscription: Stripe.Subscription): Date {
  const item = subscription.items.data[0];
  if (!item) {
    throw new Error(`Stripe subscription ${subscription.id} has no subscription items`);
  }
  return new Date(item.current_period_end * 1000);
}
