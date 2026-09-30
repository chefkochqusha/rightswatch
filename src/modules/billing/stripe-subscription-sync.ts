import type Stripe from "stripe";
import type {
  PlanRepository,
  PlanTier,
  SubscriptionRecord,
  SubscriptionRepository,
  SubscriptionStatus,
} from "./types";

/**
 * Stripe's subscription status vocabulary is wider than the schema's four
 * `SubscriptionStatus` values. Each Stripe status maps to the one of ours
 * that tells a workspace member the right thing, never to a fifth status
 * the schema doesn't have:
 *
 * - `unpaid` — Stripe stopped retrying but kept the subscription: still a
 *   payment problem the customer has to fix → PAST_DUE.
 * - `incomplete` — the first invoice needs payment or authentication (only
 *   reachable with card-at-signup; this app's trials start without one) →
 *   PAST_DUE.
 * - `paused` — a trial ended with no card under Stripe's "pause" behavior.
 *   `StripePaymentProvider` asks for "cancel" instead, but a subscription
 *   created in the Stripe dashboard could still pause → needs the customer
 *   to act → PAST_DUE.
 * - `incomplete_expired` — terminal on Stripe's side → CANCELED.
 * - anything Stripe adds later → `null`: the caller keeps the status it
 *   already has rather than guessing.
 */
export function mapStripeSubscriptionStatus(stripeStatus: string): SubscriptionStatus | null {
  switch (stripeStatus) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "paused":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    default:
      return null;
  }
}

/** The handful of subscription fields the app acts on — everything else in
 *  a Stripe subscription object (customer details, tax, discounts, …) is
 *  never read and never stored. */
export interface StripeSubscriptionSnapshot {
  stripeSubscriptionId: string;
  /** Stripe's own status string, mapped by `mapStripeSubscriptionStatus`. */
  status: string;
  priceId: string | null;
  currentPeriodEnd: Date | null;
}

/**
 * Billing period and price live on the subscription *item*, not the
 * subscription, as of Stripe's 2025-03-31 ("basil") API version — see
 * `src/lib/stripe-client.ts`. This app only ever puts one Price on a
 * subscription, so the first item is the subscription's plan and period.
 */
export function snapshotFromStripeSubscription(subscription: Stripe.Subscription): StripeSubscriptionSnapshot {
  const item = subscription.items?.data?.[0];
  return {
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    priceId: item?.price?.id ?? null,
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
  };
}

export interface SyncStripeSubscriptionDependencies {
  subscriptionRepository: SubscriptionRepository;
  planRepository: PlanRepository;
  planTierForPriceId: (priceId: string) => PlanTier | null;
}

export type SyncStripeSubscriptionResult =
  | { outcome: "updated"; subscription: SubscriptionRecord; changed: string[] }
  | { outcome: "unchanged"; subscription: SubscriptionRecord }
  | { outcome: "ignored"; reason: "UNKNOWN_SUBSCRIPTION" };

/**
 * Makes the stored `Subscription` row match what Stripe says — absolute
 * state, never a delta, so processing the same snapshot twice is harmless.
 * Absolute state alone doesn't make delivery *order* harmless (an older
 * snapshot applied last would still win), which is why the webhook hands
 * this Stripe's current state rather than the event's own copy — see
 * `retrieveSubscription` in `handle-stripe-webhook.ts`.
 *
 * Only ever touches the row whose *current* `stripeSubscriptionId` matches:
 * a subscription this app didn't create, or one a workspace has since
 * replaced by resubscribing, is ignored rather than allowed to overwrite
 * the live one (see `SubscriptionRepository.findByStripeSubscriptionId`).
 */
export async function syncStripeSubscription(
  snapshot: StripeSubscriptionSnapshot,
  deps: SyncStripeSubscriptionDependencies,
): Promise<SyncStripeSubscriptionResult> {
  const existing = await deps.subscriptionRepository.findByStripeSubscriptionId(snapshot.stripeSubscriptionId);
  if (!existing) {
    return { outcome: "ignored", reason: "UNKNOWN_SUBSCRIPTION" };
  }

  const changes: Partial<Pick<SubscriptionRecord, "planId" | "status" | "currentPeriodEnd">> = {};

  const status = mapStripeSubscriptionStatus(snapshot.status);
  if (status && status !== existing.status) {
    changes.status = status;
  }

  // A plan switch made in the Customer Portal changes the Price on Stripe's
  // side; follow it. An unrecognized Price leaves the plan as it was.
  if (snapshot.priceId) {
    const tier = deps.planTierForPriceId(snapshot.priceId);
    const plan = tier ? await deps.planRepository.findByTier(tier) : null;
    if (plan && plan.id !== existing.planId) {
      changes.planId = plan.id;
    }
  }

  if (
    snapshot.currentPeriodEnd &&
    snapshot.currentPeriodEnd.getTime() !== existing.currentPeriodEnd?.getTime()
  ) {
    changes.currentPeriodEnd = snapshot.currentPeriodEnd;
  }

  const changed = Object.keys(changes);
  if (changed.length === 0) {
    return { outcome: "unchanged", subscription: existing };
  }
  const subscription = await deps.subscriptionRepository.update(existing.id, changes);
  return { outcome: "updated", subscription, changed };
}
