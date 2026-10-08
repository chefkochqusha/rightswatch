import { test, describe } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { InMemoryWebhookEventRepository } from "@/modules/webhooks";
import type { WebhookEventRecord } from "@/modules/webhooks";
import { handleStripeWebhook } from "./handle-stripe-webhook";
import type { HandleStripeWebhookDependencies } from "./handle-stripe-webhook";
import { InMemoryPlanRepository, InMemorySubscriptionRepository } from "./in-memory-repositories";
import type { PlanTier, SubscriptionRepository } from "./types";

/**
 * Signature handling runs through the real Stripe SDK: payloads are signed
 * with `Stripe.webhooks.generateTestHeaderString` and verified with
 * `Stripe.webhooks.constructEvent` — both pure HMAC, no client, no key, no
 * network — so a bad signature here fails exactly the way it would in
 * production (Master Brief §61: integration tests for Stripe webhook
 * handling).
 */
const SECRET = "whsec_test_rightswatch";

function subscriptionEvent(
  id: string,
  type: string,
  sub: { id: string; status: string; priceId: string; periodEnd: number; email?: string },
) {
  return {
    id,
    object: "event",
    type,
    api_version: "2025-03-31.basil",
    created: 1_790_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: sub.id,
        object: "subscription",
        status: sub.status,
        customer: "cus_1",
        // Something personal a real event could carry, to prove it's never stored.
        metadata: sub.email ? { contact_email: sub.email } : {},
        items: {
          data: [{ id: "si_1", price: { id: sub.priceId }, current_period_end: sub.periodEnd }],
        },
      },
    },
  };
}

function signed(event: object, secret = SECRET) {
  const rawBody = JSON.stringify(event);
  return { rawBody, signatureHeader: Stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret }) };
}

const TIER_BY_PRICE: Record<string, PlanTier> = {
  price_starter: "STARTER",
  price_growth: "GROWTH",
  price_agency: "AGENCY",
};

async function setup(overrides: Partial<HandleStripeWebhookDependencies> = {}) {
  const subscriptionRepository = new InMemorySubscriptionRepository();
  const webhookEventRepository = new InMemoryWebhookEventRepository();
  const subscription = await subscriptionRepository.create({
    workspaceId: "workspace-1",
    planId: "plan-starter",
    status: "TRIALING",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    currentPeriodEnd: new Date("2026-10-14T00:00:00Z"),
  });
  const deps: HandleStripeWebhookDependencies = {
    webhookSecret: SECRET,
    constructEvent: (body, header, secret) => Stripe.webhooks.constructEvent(body, header, secret),
    webhookEventRepository,
    subscriptionRepository,
    planRepository: new InMemoryPlanRepository(),
    planTierForPriceId: (priceId) => TIER_BY_PRICE[priceId] ?? null,
    now: () => new Date("2026-09-30T20:00:00Z"),
    ...overrides,
  };
  return { deps, subscription, subscriptionRepository, webhookEventRepository };
}

/** Spies on `record` so a test can see exactly what was persisted. */
function recordingWebhookRepo(inner: InMemoryWebhookEventRepository, recorded: WebhookEventRecord[]) {
  return {
    async record(input: Parameters<InMemoryWebhookEventRepository["record"]>[0]) {
      const result = await inner.record(input);
      recorded.push(result.event);
      return result;
    },
    markProcessed: inner.markProcessed.bind(inner),
  };
}

describe("handleStripeWebhook — signature verification", () => {
  test("no Stripe-Signature header → 400, nothing recorded", async () => {
    const { deps, subscriptionRepository } = await setup();
    const result = await handleStripeWebhook({ rawBody: "{}", signatureHeader: null }, deps);
    assert.equal(result.status, 400);
    assert.equal((await subscriptionRepository.findByWorkspaceId("workspace-1"))?.status, "TRIALING");
  });

  test("a body altered after signing → 400, and the forged status is never applied", async () => {
    const { deps, subscriptionRepository } = await setup();
    const genuine = signed(
      subscriptionEvent("evt_1", "customer.subscription.updated", {
        id: "sub_1",
        status: "past_due",
        priceId: "price_starter",
        periodEnd: 1_792_000_000,
      }),
    );
    const tampered = { ...genuine, rawBody: genuine.rawBody.replace("past_due", "active") };
    const result = await handleStripeWebhook(tampered, deps);
    assert.equal(result.status, 400);
    assert.equal((await subscriptionRepository.findByWorkspaceId("workspace-1"))?.status, "TRIALING");
  });

  test("signed with a different secret → 400", async () => {
    const { deps } = await setup();
    const delivery = signed(
      subscriptionEvent("evt_1", "customer.subscription.updated", {
        id: "sub_1",
        status: "active",
        priceId: "price_starter",
        periodEnd: 1_792_000_000,
      }),
      "whsec_someone_else",
    );
    assert.equal((await handleStripeWebhook(delivery, deps)).status, 400);
  });
});

describe("handleStripeWebhook — subscription sync", () => {
  test("customer.subscription.updated syncs status and billing period, and records the delivery as processed", async () => {
    const recorded: WebhookEventRecord[] = [];
    const inner = new InMemoryWebhookEventRepository();
    const { deps, subscriptionRepository } = await setup({
      webhookEventRepository: recordingWebhookRepo(inner, recorded),
    });

    const result = await handleStripeWebhook(
      signed(
        subscriptionEvent("evt_1", "customer.subscription.updated", {
          id: "sub_1",
          status: "active",
          priceId: "price_starter",
          periodEnd: 1_792_000_000,
        }),
      ),
      deps,
    );

    assert.equal(result.status, 200);
    assert.equal(result.log.outcome, "updated");
    const stored = await subscriptionRepository.findByWorkspaceId("workspace-1");
    assert.equal(stored?.status, "ACTIVE");
    assert.deepEqual(stored?.currentPeriodEnd, new Date(1_792_000_000 * 1000));

    const redelivery = await inner.record({ source: "stripe", externalId: "evt_1", payload: {} });
    assert.deepEqual(redelivery.event.processedAt, new Date("2026-09-30T20:00:00Z"));
  });

  test("the recorded payload keeps only what was acted on — no customer data (Brief §59)", async () => {
    const recorded: WebhookEventRecord[] = [];
    const { deps } = await setup({
      webhookEventRepository: recordingWebhookRepo(new InMemoryWebhookEventRepository(), recorded),
    });
    await handleStripeWebhook(
      signed(
        subscriptionEvent("evt_1", "customer.subscription.updated", {
          id: "sub_1",
          status: "active",
          priceId: "price_starter",
          periodEnd: 1_792_000_000,
          email: "nina@northstar.example",
        }),
      ),
      deps,
    );
    assert.equal(recorded.length, 1);
    assert.deepEqual(Object.keys(recorded[0].payload).sort(), [
      "currentPeriodEnd",
      "priceId",
      "status",
      "stripeSubscriptionId",
      "type",
    ]);
    assert.ok(!JSON.stringify(recorded[0].payload).includes("nina@"));
  });

  test("the same event delivered twice is processed once (Brief §22)", async () => {
    let updates = 0;
    const inner = new InMemorySubscriptionRepository();
    const counting: SubscriptionRepository = {
      findByWorkspaceId: inner.findByWorkspaceId.bind(inner),
      findByStripeSubscriptionId: inner.findByStripeSubscriptionId.bind(inner),
      create: inner.create.bind(inner),
      update: async (id, changes) => {
        updates += 1;
        return inner.update(id, changes);
      },
    };
    await inner.create({
      workspaceId: "workspace-1",
      planId: "plan-starter",
      status: "TRIALING",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      currentPeriodEnd: null,
    });
    const { deps } = await setup({ subscriptionRepository: counting });

    const delivery = signed(
      subscriptionEvent("evt_1", "customer.subscription.updated", {
        id: "sub_1",
        status: "active",
        priceId: "price_starter",
        periodEnd: 1_792_000_000,
      }),
    );
    const first = await handleStripeWebhook(delivery, deps);
    const second = await handleStripeWebhook(delivery, deps);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.log.outcome, "duplicate");
    assert.equal(updates, 1);
  });

  test("customer.subscription.deleted (trial ended with no card, or a portal cancel) → CANCELED", async () => {
    const { deps, subscriptionRepository } = await setup();
    await handleStripeWebhook(
      signed(
        subscriptionEvent("evt_2", "customer.subscription.deleted", {
          id: "sub_1",
          status: "canceled",
          priceId: "price_starter",
          periodEnd: 1_792_000_000,
        }),
      ),
      deps,
    );
    assert.equal((await subscriptionRepository.findByWorkspaceId("workspace-1"))?.status, "CANCELED");
  });

  test("a plan switched in the Customer Portal follows through to the plan", async () => {
    const { deps, subscriptionRepository } = await setup();
    await handleStripeWebhook(
      signed(
        subscriptionEvent("evt_3", "customer.subscription.updated", {
          id: "sub_1",
          status: "trialing",
          priceId: "price_growth",
          periodEnd: 1_792_000_000,
        }),
      ),
      deps,
    );
    assert.equal((await subscriptionRepository.findByWorkspaceId("workspace-1"))?.planId, "plan-growth");
  });

  test("an event for a subscription this app doesn't know → 200 and marked processed (retrying can't help)", async () => {
    const { deps } = await setup();
    const result = await handleStripeWebhook(
      signed(
        subscriptionEvent("evt_4", "customer.subscription.updated", {
          id: "sub_made_in_dashboard",
          status: "active",
          priceId: "price_starter",
          periodEnd: 1_792_000_000,
        }),
      ),
      deps,
    );
    assert.equal(result.status, 200);
    assert.equal(result.log.outcome, "ignored_unknown_subscription");
  });

  test("an event type this app doesn't act on is acknowledged and recorded, nothing else", async () => {
    const recorded: WebhookEventRecord[] = [];
    const { deps, subscriptionRepository } = await setup({
      webhookEventRepository: recordingWebhookRepo(new InMemoryWebhookEventRepository(), recorded),
    });
    const result = await handleStripeWebhook(
      signed({ ...subscriptionEvent("evt_5", "invoice.paid", { id: "sub_1", status: "active", priceId: "p", periodEnd: 1 }) }),
      deps,
    );
    assert.equal(result.status, 200);
    assert.equal(result.log.outcome, "acknowledged");
    assert.deepEqual(recorded[0].payload, { type: "invoice.paid" });
    assert.equal((await subscriptionRepository.findByWorkspaceId("workspace-1"))?.status, "TRIALING");
  });
});

/** The `data.object` of `subscriptionEvent`, standing in for what
 *  `subscriptions.retrieve` returns. */
function stripeSubscription(sub: { id: string; status: string; priceId: string; periodEnd: number }) {
  return subscriptionEvent("unused", "unused", sub).data.object as unknown as Stripe.Subscription;
}

describe("handleStripeWebhook — current state from Stripe (delivery order)", () => {
  test("an older event delivered after a newer one can't roll the status back", async () => {
    // Stripe's truth right now: the trial already converted.
    const now = stripeSubscription({ id: "sub_1", status: "active", priceId: "price_starter", periodEnd: 1_792_000_000 });
    const { deps, subscriptionRepository } = await setup({ retrieveSubscription: async () => now });

    const newer = await handleStripeWebhook(
      signed(
        subscriptionEvent("evt_new", "customer.subscription.updated", {
          id: "sub_1",
          status: "active",
          priceId: "price_starter",
          periodEnd: 1_792_000_000,
        }),
      ),
      deps,
    );
    // The trialing-era event, delayed in transit, arrives last.
    const older = await handleStripeWebhook(
      signed(
        subscriptionEvent("evt_old", "customer.subscription.updated", {
          id: "sub_1",
          status: "trialing",
          priceId: "price_starter",
          periodEnd: 1_790_500_000,
        }),
      ),
      deps,
    );

    assert.equal(newer.log.outcome, "updated");
    assert.equal(older.status, 200);
    assert.equal(older.log.outcome, "unchanged");
    assert.equal(older.log.stateFrom, "stripe_api");
    assert.equal((await subscriptionRepository.findByWorkspaceId("workspace-1"))?.status, "ACTIVE");
  });

  test("a subscription Stripe no longer has (resource_missing) falls back to the event's copy instead of failing for days", async () => {
    const { deps, subscriptionRepository } = await setup({
      retrieveSubscription: async () => {
        throw Object.assign(new Error("No such subscription: 'sub_1'"), { code: "resource_missing" });
      },
    });
    const result = await handleStripeWebhook(
      signed(
        subscriptionEvent("evt_7", "customer.subscription.deleted", {
          id: "sub_1",
          status: "canceled",
          priceId: "price_starter",
          periodEnd: 1_792_000_000,
        }),
      ),
      deps,
    );
    assert.equal(result.status, 200);
    assert.equal(result.log.stateFrom, "event_payload");
    assert.equal((await subscriptionRepository.findByWorkspaceId("workspace-1"))?.status, "CANCELED");
  });

  test("any other failure fetching from Stripe → 500, so Stripe retries later", async () => {
    const { deps, subscriptionRepository } = await setup({
      retrieveSubscription: async () => {
        throw Object.assign(new Error("Too many requests"), { code: "rate_limit" });
      },
    });
    const result = await handleStripeWebhook(
      signed(
        subscriptionEvent("evt_8", "customer.subscription.updated", {
          id: "sub_1",
          status: "active",
          priceId: "price_starter",
          periodEnd: 1_792_000_000,
        }),
      ),
      deps,
    );
    assert.equal(result.status, 500);
    assert.equal((await subscriptionRepository.findByWorkspaceId("workspace-1"))?.status, "TRIALING");
  });
});

describe("handleStripeWebhook — failure and retry", () => {
  test("a failure mid-processing → 500, delivery left unprocessed, and Stripe's retry then succeeds", async () => {
    const inner = new InMemorySubscriptionRepository();
    await inner.create({
      workspaceId: "workspace-1",
      planId: "plan-starter",
      status: "TRIALING",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      currentPeriodEnd: null,
    });
    let databaseDown = true;
    const flaky: SubscriptionRepository = {
      findByWorkspaceId: inner.findByWorkspaceId.bind(inner),
      create: inner.create.bind(inner),
      update: inner.update.bind(inner),
      findByStripeSubscriptionId: async (id) => {
        if (databaseDown) throw new Error("connection refused");
        return inner.findByStripeSubscriptionId(id);
      },
    };
    const { deps } = await setup({ subscriptionRepository: flaky });
    const delivery = signed(
      subscriptionEvent("evt_6", "customer.subscription.updated", {
        id: "sub_1",
        status: "active",
        priceId: "price_starter",
        periodEnd: 1_792_000_000,
      }),
    );

    const failed = await handleStripeWebhook(delivery, deps);
    assert.equal(failed.status, 500);
    assert.equal(failed.log.outcome, "error");

    databaseDown = false;
    const retried = await handleStripeWebhook(delivery, deps);
    assert.equal(retried.status, 200);
    assert.equal(retried.log.outcome, "updated", "the retry is processed, not skipped as a duplicate");
    assert.equal((await inner.findByWorkspaceId("workspace-1"))?.status, "ACTIVE");
  });
});

describe("handleStripeWebhook: invoice.paid (partner commissions)", () => {
  function invoiceEvent(id: string, invoice: Record<string, unknown>) {
    return {
      id, object: "event", type: "invoice.paid", api_version: "2025-03-31.basil", created: 1_790_000_000,
      livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null },
      data: { object: { object: "invoice", created: 1_790_000_000, amount_paid: 35_581, ...invoice } },
    };
  }

  test("a paid invoice of a known subscription reaches onInvoicePaid with the workspace and the net amount", async () => {
    const calls: unknown[] = [];
    const { deps } = await setup({ onInvoicePaid: async (i) => { calls.push(i); return "commission_created"; } });
    const result = await handleStripeWebhook(
      signed(invoiceEvent("evt_inv_1", { id: "in_1", total_excluding_tax: 29_900, status_transitions: { paid_at: 1_790_000_100 }, parent: { subscription_details: { subscription: "sub_1" } } })),
      deps,
    );
    assert.equal(result.status, 200);
    assert.equal(result.log.outcome, "commission_created");
    assert.deepEqual(calls, [{ workspaceId: "workspace-1", invoiceId: "in_1", amountCents: 29_900, paidAt: new Date(1_790_000_100 * 1000) }]);
  });

  test("an invoice for an unknown or missing subscription is acknowledged without a commission", async () => {
    let called = false;
    const { deps } = await setup({ onInvoicePaid: async () => { called = true; return "x"; } });
    const unknown = await handleStripeWebhook(signed(invoiceEvent("evt_inv_2", { id: "in_2", subscription: "sub_other" })), deps);
    const none = await handleStripeWebhook(signed(invoiceEvent("evt_inv_3", { id: "in_3" })), deps);
    assert.equal(unknown.log.outcome, "invoice_unknown_subscription");
    assert.equal(none.log.outcome, "invoice_without_subscription");
    assert.equal(called, false);
  });
});
