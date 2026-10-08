import type { BillingInterval, PaymentProvider, PlanTier } from "./types";

/**
 * Deciding *which* `PaymentProvider` the app runs on, and which one a given
 * stored id belongs to — kept separate from both providers so all of it can
 * be unit-tested without Stripe, a network, or a database.
 *
 * `app/_lib/billing-store.ts` calls `getPaymentMode(process.env)`: every
 * Stripe env var set → `"stripe"` (real Stripe, wrapped in
 * `RoutingPaymentProvider` below); anything missing → `"mock"`
 * (`MockPaymentProvider`, exactly as before). Setting the variables in
 * Vercel and redeploying is the whole cutover — no code change.
 *
 * All-or-nothing on purpose:
 * - A secret key with no Price ids would let a workspace start subscribing
 *   and fail halfway through (`StripePaymentProvider.getPriceId` throws).
 * - A secret key with no webhook secret is worse, because it *doesn't*
 *   fail: subscribing works, but nothing Stripe changes afterwards — a
 *   trial ending, a failed payment, a cancellation in the Customer Portal —
 *   would ever reach the database (Master Brief §18: "Never trust only the
 *   frontend ... Stripe webhook events must update the internal
 *   subscription state"). Staying on the mock until the setup is complete
 *   is the only state that's never silently wrong.
 */
export const STRIPE_PRICE_ID_ENV_VAR: Record<PlanTier, string> = {
  STARTER: "STRIPE_PRICE_ID_STARTER",
  GROWTH: "STRIPE_PRICE_ID_GROWTH",
  AGENCY: "STRIPE_PRICE_ID_AGENCY",
};

/** Annual prices (optional): without them, annual billing is refused in Stripe mode with a clear message. */
export const STRIPE_ANNUAL_PRICE_ID_ENV_VAR: Record<PlanTier, string> = {
  STARTER: "STRIPE_PRICE_ID_STARTER_ANNUAL",
  GROWTH: "STRIPE_PRICE_ID_GROWTH_ANNUAL",
  AGENCY: "STRIPE_PRICE_ID_AGENCY_ANNUAL",
};

const REQUIRED_STRIPE_ENV_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  ...Object.values(STRIPE_PRICE_ID_ENV_VAR),
] as const;

type Env = Record<string, string | undefined>;

export type PaymentMode = "stripe" | "mock";

export function isStripeConfigured(env: Env): boolean {
  return REQUIRED_STRIPE_ENV_VARS.every((name) => Boolean(env[name]?.trim()));
}

export function getPaymentMode(env: Env): PaymentMode {
  return isStripeConfigured(env) ? "stripe" : "mock";
}

/** Which required Stripe variables are still missing — for the billing
 *  page and setup docs to say exactly what's left, rather than just "not
 *  configured". Names only, never values. */
export function missingStripeEnvVars(env: Env): string[] {
  return REQUIRED_STRIPE_ENV_VARS.filter((name) => !env[name]?.trim());
}

/**
 * Reverse of `STRIPE_PRICE_ID_ENV_VAR`: which plan tier a Stripe Price id
 * is. Used by the webhook when a subscription's price changed outside this
 * app (a plan switch in the Customer Portal). `null` for a price that isn't
 * one of the three configured ones — the caller leaves the plan alone
 * rather than guessing.
 */
export function planTierForPriceId(priceId: string, env: Env): PlanTier | null {
  for (const map of [STRIPE_PRICE_ID_ENV_VAR, STRIPE_ANNUAL_PRICE_ID_ENV_VAR]) {
    for (const [tier, envVar] of Object.entries(map) as [PlanTier, string][]) {
      if (env[envVar]?.trim() === priceId) return tier;
    }
  }
  return null;
}

const MOCK_CUSTOMER_PREFIX = "cus_mock_";
const MOCK_SUBSCRIPTION_PREFIX = "sub_mock_";

/** `MockPaymentProvider` prefixes every id it mints (see its doc comment),
 *  so a stored id says on its own which provider created it. */
export function isMockCustomerId(customerId: string): boolean {
  return customerId.startsWith(MOCK_CUSTOMER_PREFIX);
}

export function isMockSubscriptionId(subscriptionId: string): boolean {
  return subscriptionId.startsWith(MOCK_SUBSCRIPTION_PREFIX);
}

/**
 * Routes each call to whichever provider actually owns the id involved.
 *
 * Why this exists: every workspace that subscribed while the app ran on
 * `MockPaymentProvider` has `cus_mock_…`/`sub_mock_…` ids stored in its
 * `Subscription` row. Switching the whole app to Stripe outright would make
 * those workspaces' next plan change or cancel call real Stripe with an id
 * Stripe has never seen — a 404 surfaced to a user as a failed button
 * click. Instead, anything that already lives on the mock stays on the
 * mock, and everything new goes to Stripe:
 *
 * - `createCustomer` — always the real provider (a brand-new customer has
 *   no history anywhere yet).
 * - `canReuseCustomer` — the real provider's answer, so a mock customer
 *   is never reused: `subscribeWorkspace` creates a real one instead.
 * - `changeSubscriptionPlan` / `cancelSubscription` — the mock for a mock
 *   subscription id, otherwise the real provider.
 * - `createSubscription` — the real provider, except for a mock customer
 *   id, which goes to the mock. `subscribeWorkspace` never sends one here
 *   (see `canReuseCustomer`); the branch is a guard, so a future caller
 *   that forgets to ask can't hand a `cus_mock_…` id to real Stripe.
 *
 * The consequence, stated plainly: a workspace that subscribed during the
 * mock era keeps that demo subscription — plan switches included — until
 * it cancels. Its next subscribe after that creates a real Stripe customer
 * and a real trial. The billing page tells such a workspace exactly that,
 * rather than leaving it implicit.
 */
export class RoutingPaymentProvider implements PaymentProvider {
  constructor(
    private readonly real: PaymentProvider,
    private readonly mock: PaymentProvider,
  ) {}

  createCustomer(input: { email: string; workspaceId: string }): Promise<{ customerId: string }> {
    return this.real.createCustomer(input);
  }

  createSubscription(input: {
    customerId: string;
    planTier: PlanTier;
    interval?: BillingInterval;
  }): Promise<{ subscriptionId: string; currentPeriodEnd: Date }> {
    return (isMockCustomerId(input.customerId) ? this.mock : this.real).createSubscription(input);
  }

  changeSubscriptionPlan(input: { subscriptionId: string; planTier: PlanTier; interval?: BillingInterval }): Promise<void> {
    return (isMockSubscriptionId(input.subscriptionId) ? this.mock : this.real).changeSubscriptionPlan(
      input,
    );
  }

  cancelSubscription(subscriptionId: string): Promise<void> {
    return (isMockSubscriptionId(subscriptionId) ? this.mock : this.real).cancelSubscription(
      subscriptionId,
    );
  }

  canReuseCustomer(customerId: string): boolean {
    return this.real.canReuseCustomer(customerId);
  }
}
