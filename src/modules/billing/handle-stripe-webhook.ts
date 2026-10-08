import type Stripe from "stripe";
import type { WebhookEventRepository } from "@/modules/webhooks";
import { snapshotFromStripeSubscription, syncStripeSubscription } from "./stripe-subscription-sync";
import type { StripeSubscriptionSnapshot } from "./stripe-subscription-sync";
import type { PlanRepository, PlanTier, SubscriptionRepository } from "./types";

/**
 * Every Stripe event that carries a subscription object whose status,
 * price or billing period this app mirrors. `invoice.*` events are
 * deliberately not in the list: a failed payment already reaches us as a
 * `customer.subscription.updated` (status → `past_due`), so handling both
 * would just process the same fact twice.
 */
export const HANDLED_STRIPE_EVENT_TYPES = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
] as const;

const HANDLED = new Set<string>(HANDLED_STRIPE_EVENT_TYPES);

export interface HandleStripeWebhookInput {
  /** The request body exactly as received — signature verification is over
   *  these bytes, so it must never be parsed and re-serialized first. */
  rawBody: string;
  signatureHeader: string | null;
}

export interface HandleStripeWebhookDependencies {
  webhookSecret: string;
  /** `Stripe.webhooks.constructEvent` in production. Injected so the tests
   *  can use the SDK's real, offline signing and verification too. */
  constructEvent: (rawBody: string, signatureHeader: string, secret: string) => Stripe.Event;
  webhookEventRepository: WebhookEventRepository;
  subscriptionRepository: SubscriptionRepository;
  planRepository: PlanRepository;
  planTierForPriceId: (priceId: string) => PlanTier | null;
  /**
   * Fetches the subscription's *current* state from Stripe
   * (`subscriptions.retrieve` in production). Stripe doesn't guarantee
   * delivery order, so syncing from an event's own payload would let an
   * older event that arrives last roll the row back — `active` → `trialing`
   * after a trial already converted. Syncing from what Stripe says now makes
   * arrival order irrelevant, and reads the object at the SDK's pinned API
   * version rather than whatever version the webhook endpoint was created
   * with. Optional only so tests can also exercise the payload fallback;
   * the route always supplies it.
   */
  retrieveSubscription?: (stripeSubscriptionId: string) => Promise<Stripe.Subscription>;
  /**
   * A paid invoice (`invoice.paid`), for the partner programme's commissions.
   * Gets the workspace the invoice belongs to and the amount before tax.
   * Optional: without it invoices are only acknowledged.
   */
  onInvoicePaid?: (invoice: { workspaceId: string; invoiceId: string; amountCents: number; paidAt: Date }) => Promise<string>;
  now?: () => Date;
}

export interface HandleStripeWebhookResult {
  /** 200 tells Stripe to stop; 400 is a delivery that can never succeed
   *  (bad signature); 500 makes Stripe retry later with the same event. */
  status: 200 | 400 | 500;
  body: string;
  /** One structured line for the platform log (Master Brief §60 "billing
   *  webhook logs"). Ids and outcomes only — never customer data. */
  log: Record<string, unknown>;
}

/**
 * The whole inbound Stripe webhook, minus the HTTP plumbing
 * (`app/api/webhooks/stripe/route.ts` is a thin wrapper around this):
 *
 * 1. Verify the signature — nothing unverified is recorded or acted on.
 * 2. Record the delivery in `WebhookEvent`, keyed on Stripe's event id
 *    (Master Brief §22). A redelivery of an already-processed event stops
 *    here with a 200.
 * 3. Sync the subscription (`syncStripeSubscription`) for the event types
 *    above — from its current state as Stripe reports it right now
 *    (`retrieveSubscription`), not from the possibly-stale copy inside the
 *    event; acknowledge anything else.
 * 4. Mark the delivery processed — only after the sync succeeded. If it
 *    throws, the 500 leaves `processedAt` empty and Stripe's retry of the
 *    same event gets processed normally.
 */
export async function handleStripeWebhook(
  input: HandleStripeWebhookInput,
  deps: HandleStripeWebhookDependencies,
): Promise<HandleStripeWebhookResult> {
  if (!input.signatureHeader) {
    return {
      status: 400,
      body: "Missing Stripe-Signature header.",
      log: { outcome: "rejected", reason: "missing_signature" },
    };
  }

  let event: Stripe.Event;
  try {
    event = deps.constructEvent(input.rawBody, input.signatureHeader, deps.webhookSecret);
  } catch {
    return {
      status: 400,
      body: "Invalid signature.",
      log: { outcome: "rejected", reason: "invalid_signature" },
    };
  }

  const log: Record<string, unknown> = { eventId: event.id, type: event.type };

  try {
    // Every handled type's `data.object` is a Subscription — the Set check
    // above is what establishes that, which TypeScript can't see through.
    const snapshot = HANDLED.has(event.type)
      ? snapshotFromStripeSubscription(event.data.object as Stripe.Subscription)
      : null;

    const { event: delivery } = await deps.webhookEventRepository.record({
      source: "stripe",
      externalId: event.id,
      payload: {
        type: event.type,
        ...(snapshot && {
          stripeSubscriptionId: snapshot.stripeSubscriptionId,
          status: snapshot.status,
          priceId: snapshot.priceId,
          currentPeriodEnd: snapshot.currentPeriodEnd?.toISOString() ?? null,
        }),
      },
    });

    if (delivery.processedAt) {
      return { status: 200, body: "Already processed.", log: { ...log, outcome: "duplicate" } };
    }

    let outcome = "acknowledged";
    if (event.type === "invoice.paid" && deps.onInvoicePaid) {
      outcome = await handleInvoicePaid(event.data.object as Stripe.Invoice, deps, deps.onInvoicePaid);
    }
    if (snapshot) {
      const current = deps.retrieveSubscription
        ? await currentState(snapshot, deps.retrieveSubscription, log)
        : snapshot;
      const result = await syncStripeSubscription(current, deps);
      outcome = result.outcome === "ignored" ? "ignored_unknown_subscription" : result.outcome;
      if (result.outcome === "updated") log.changed = result.changed;
    }

    await deps.webhookEventRepository.markProcessed(delivery.id, (deps.now ?? (() => new Date()))());
    return { status: 200, body: "OK", log: { ...log, outcome } };
  } catch (error) {
    return {
      status: 500,
      body: "Processing failed; Stripe will retry.",
      log: { ...log, outcome: "error", error: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * The subscription as Stripe has it now. One exception falls back to the
 * event's own copy: a subscription Stripe no longer has at all
 * (`resource_missing` — e.g. after "Delete all test data" in the
 * dashboard). Retrying can never fix that, and a 500 would have Stripe
 * keep redelivering it (for days in live mode). Any other failure (network, rate limit, Stripe
 * down) rethrows, so the 500 makes Stripe retry later — the right outcome
 * for something that will succeed again.
 */
async function currentState(
  fromEvent: StripeSubscriptionSnapshot,
  retrieve: (stripeSubscriptionId: string) => Promise<Stripe.Subscription>,
  log: Record<string, unknown>,
): Promise<StripeSubscriptionSnapshot> {
  try {
    const snapshot = snapshotFromStripeSubscription(await retrieve(fromEvent.stripeSubscriptionId));
    log.stateFrom = "stripe_api";
    return snapshot;
  } catch (error) {
    if ((error as { code?: string }).code === "resource_missing") {
      log.stateFrom = "event_payload";
      return fromEvent;
    }
    throw error;
  }
}

/** The Stripe subscription id an invoice belongs to (newer and older API shapes). */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } | null } | null } | null }).parent;
  const fromParent = parent?.subscription_details?.subscription;
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  const value = fromParent ?? legacy ?? null;
  return typeof value === "string" ? value : (value?.id ?? null);
}

async function handleInvoicePaid(
  invoice: Stripe.Invoice,
  deps: HandleStripeWebhookDependencies,
  onInvoicePaid: NonNullable<HandleStripeWebhookDependencies["onInvoicePaid"]>,
): Promise<string> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!invoice.id || !subscriptionId) return "invoice_without_subscription";
  const subscription = await deps.subscriptionRepository.findByStripeSubscriptionId(subscriptionId);
  if (!subscription) return "invoice_unknown_subscription";
  // Commission is on the net amount: tax is not revenue.
  const net = (invoice as unknown as { total_excluding_tax?: number | null }).total_excluding_tax;
  const amountCents = typeof net === "number" ? net : invoice.amount_paid;
  const paidAtSeconds = invoice.status_transitions?.paid_at ?? invoice.created;
  return onInvoicePaid({ workspaceId: subscription.workspaceId, invoiceId: invoice.id, amountCents, paidAt: new Date(paidAtSeconds * 1000) });
}
