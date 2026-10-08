import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { subscribeWorkspace } from "./subscribe-workspace";
import { cancelSubscription } from "./cancel-subscription";
import { InMemoryPlanRepository, InMemorySubscriptionRepository } from "./in-memory-repositories";
import { MockPaymentProvider } from "./mock-payment-provider";
import { RoutingPaymentProvider, isMockCustomerId, isMockSubscriptionId } from "./payment-provider-selection";
import type { PaymentProvider, PlanTier } from "./types";

/** Stands in for `StripePaymentProvider`: mints Stripe-shaped ids and
 *  records every id it's handed, so a test can prove no demo-era id ever
 *  reached "Stripe". */
function fakeStripe(seen: string[]): PaymentProvider {
  let n = 0;
  return {
    async createCustomer() {
      n += 1;
      return { customerId: `cus_Real${n}` };
    },
    async createSubscription(input: { customerId: string; planTier: PlanTier }) {
      seen.push(input.customerId);
      n += 1;
      return { subscriptionId: `sub_Real${n}`, currentPeriodEnd: new Date("2026-10-14T00:00:00Z") };
    },
    async changeSubscriptionPlan(input: { subscriptionId: string; planTier: PlanTier }) {
      seen.push(input.subscriptionId);
    },
    async cancelSubscription(subscriptionId: string) {
      seen.push(subscriptionId);
    },
    canReuseCustomer: (customerId: string) => !isMockCustomerId(customerId),
  };
}

function makeDeps() {
  return {
    planRepository: new InMemoryPlanRepository(),
    subscriptionRepository: new InMemorySubscriptionRepository(),
    paymentProvider: new MockPaymentProvider(),
  };
}

describe("subscribeWorkspace", () => {
  test("a fresh subscribe creates a TRIALING subscription on the chosen plan", async () => {
    const deps = makeDeps();
    const result = await subscribeWorkspace(
      { workspaceId: "workspace-1", planTier: "STARTER", customerEmail: "owner@example.com" },
      deps,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.subscription.status, "TRIALING");
    assert.equal(result.subscription.planId, "plan-starter");
    assert.match(result.subscription.stripeCustomerId, /^cus_mock_/);
    assert.match(result.subscription.stripeSubscriptionId ?? "", /^sub_mock_/);
    assert.ok(result.subscription.currentPeriodEnd);
  });

  test("fails for an unknown plan tier", async () => {
    const deps = makeDeps();
    const result = await subscribeWorkspace(
      // @ts-expect-error deliberately invalid tier, exercising the runtime guard
      { workspaceId: "workspace-1", planTier: "ENTERPRISE", customerEmail: "owner@example.com" },
      deps,
    );
    assert.deepEqual(result, { ok: false, error: "PLAN_NOT_FOUND" });
  });

  test("subscribing again to the same plan is a no-op that returns the existing subscription", async () => {
    const deps = makeDeps();
    const first = await subscribeWorkspace(
      { workspaceId: "workspace-1", planTier: "STARTER", customerEmail: "owner@example.com" },
      deps,
    );
    const second = await subscribeWorkspace(
      { workspaceId: "workspace-1", planTier: "STARTER", customerEmail: "owner@example.com" },
      deps,
    );
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.deepEqual(second.subscription, first.subscription);
  });

  test("switching plans keeps the same customer/subscription id and currentPeriodEnd", async () => {
    const deps = makeDeps();
    const first = await subscribeWorkspace(
      { workspaceId: "workspace-1", planTier: "STARTER", customerEmail: "owner@example.com" },
      deps,
    );
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const switched = await subscribeWorkspace(
      { workspaceId: "workspace-1", planTier: "GROWTH", customerEmail: "owner@example.com" },
      deps,
    );
    assert.equal(switched.ok, true);
    if (!switched.ok) return;

    assert.equal(switched.subscription.planId, "plan-growth");
    assert.equal(switched.subscription.stripeCustomerId, first.subscription.stripeCustomerId);
    assert.equal(switched.subscription.stripeSubscriptionId, first.subscription.stripeSubscriptionId);
    assert.deepEqual(switched.subscription.currentPeriodEnd, first.subscription.currentPeriodEnd);
    assert.equal(switched.subscription.status, "TRIALING", "a plan switch doesn't change status");
  });

  test("resubscribing after cancellation reuses the customer id but issues a new subscription id", async () => {
    const deps = makeDeps();
    const first = await subscribeWorkspace(
      { workspaceId: "workspace-1", planTier: "STARTER", customerEmail: "owner@example.com" },
      deps,
    );
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const canceled = await cancelSubscription({ workspaceId: "workspace-1" }, deps);
    assert.equal(canceled.ok, true);
    if (!canceled.ok) return;
    assert.equal(canceled.subscription.status, "CANCELED");

    const resubscribed = await subscribeWorkspace(
      { workspaceId: "workspace-1", planTier: "AGENCY", customerEmail: "owner@example.com" },
      deps,
    );
    assert.equal(resubscribed.ok, true);
    if (!resubscribed.ok) return;

    assert.equal(resubscribed.subscription.status, "TRIALING");
    assert.equal(resubscribed.subscription.planId, "plan-agency");
    assert.equal(
      resubscribed.subscription.stripeCustomerId,
      first.subscription.stripeCustomerId,
      "the payment-provider customer is reused across a cancel/resubscribe",
    );
    assert.notEqual(
      resubscribed.subscription.stripeSubscriptionId,
      first.subscription.stripeSubscriptionId,
      "a fresh subscription id is issued on resubscribe",
    );
  });

  test("a demo-era workspace keeps demo billing until it cancels, then moves to real Stripe on its next subscribe", async () => {
    const planRepository = new InMemoryPlanRepository();
    const subscriptionRepository = new InMemorySubscriptionRepository();

    // Subscribed while the app still ran on MockPaymentProvider.
    const demoEra = await subscribeWorkspace(
      { workspaceId: "workspace-1", planTier: "STARTER", customerEmail: "owner@example.com" },
      { planRepository, subscriptionRepository, paymentProvider: new MockPaymentProvider() },
    );
    assert.equal(demoEra.ok, true);
    if (!demoEra.ok) return;

    // Stripe keys land in Vercel: the store now hands out the router.
    const seenByStripe: string[] = [];
    const stripeMode = {
      planRepository,
      subscriptionRepository,
      paymentProvider: new RoutingPaymentProvider(fakeStripe(seenByStripe), new MockPaymentProvider()),
    };

    // A plan switch on the demo subscription stays on the mock...
    const switched = await subscribeWorkspace(
      { workspaceId: "workspace-1", planTier: "GROWTH", customerEmail: "owner@example.com" },
      stripeMode,
    );
    assert.equal(switched.ok, true);
    if (!switched.ok) return;
    assert.ok(isMockSubscriptionId(switched.subscription.stripeSubscriptionId ?? ""));

    // ...and so does cancelling it.
    await cancelSubscription({ workspaceId: "workspace-1" }, stripeMode);

    // The next subscribe creates a real customer and a real trial on the same row.
    const real = await subscribeWorkspace(
      { workspaceId: "workspace-1", planTier: "GROWTH", customerEmail: "owner@example.com" },
      stripeMode,
    );
    assert.equal(real.ok, true);
    if (!real.ok) return;
    assert.equal(real.subscription.id, demoEra.subscription.id, "same row, not a second subscription");
    assert.equal(real.subscription.status, "TRIALING");
    assert.equal(real.subscription.stripeCustomerId, "cus_Real1");
    assert.equal(real.subscription.stripeSubscriptionId, "sub_Real2");
    assert.equal(
      seenByStripe.some((id) => id.includes("_mock_")),
      false,
      "no demo-era id ever reached Stripe",
    );
  });

  test("a real Stripe customer is reused on resubscribe, never replaced", async () => {
    const seenByStripe: string[] = [];
    const deps = {
      planRepository: new InMemoryPlanRepository(),
      subscriptionRepository: new InMemorySubscriptionRepository(),
      paymentProvider: new RoutingPaymentProvider(fakeStripe(seenByStripe), new MockPaymentProvider()),
    };
    const first = await subscribeWorkspace(
      { workspaceId: "workspace-1", planTier: "STARTER", customerEmail: "owner@example.com" },
      deps,
    );
    await cancelSubscription({ workspaceId: "workspace-1" }, deps);
    const again = await subscribeWorkspace(
      { workspaceId: "workspace-1", planTier: "STARTER", customerEmail: "owner@example.com" },
      deps,
    );
    assert.equal(first.ok && again.ok, true);
    if (!first.ok || !again.ok) return;
    assert.equal(again.subscription.stripeCustomerId, first.subscription.stripeCustomerId);
    assert.notEqual(again.subscription.stripeSubscriptionId, first.subscription.stripeSubscriptionId);
  });

  test("two different workspaces subscribing get independent subscriptions", async () => {
    const deps = makeDeps();
    const a = await subscribeWorkspace(
      { workspaceId: "workspace-a", planTier: "STARTER", customerEmail: "a@example.com" },
      deps,
    );
    const b = await subscribeWorkspace(
      { workspaceId: "workspace-b", planTier: "GROWTH", customerEmail: "b@example.com" },
      deps,
    );
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) return;
    assert.notEqual(a.subscription.id, b.subscription.id);
    assert.notEqual(a.subscription.stripeCustomerId, b.subscription.stripeCustomerId);
  });
});

describe("subscribeWorkspace: billing interval and loyalty", () => {
  test("a new subscription starts the loyalty clock at the end of the trial and keeps the chosen interval", async () => {
    const deps = makeDeps();
    const r = await subscribeWorkspace({ workspaceId: "w1", planTier: "GROWTH", interval: "ANNUAL", customerEmail: "a@b.c" }, deps);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.subscription.billingInterval, "ANNUAL");
    assert.deepEqual(r.subscription.loyaltyStartedAt, r.subscription.currentPeriodEnd);
  });

  test("switching interval or plan keeps the loyalty clock; a resubscribe after cancelling restarts it", async () => {
    const deps = makeDeps();
    const first = await subscribeWorkspace({ workspaceId: "w2", planTier: "STARTER", customerEmail: "a@b.c" }, deps);
    assert.ok(first.ok);
    if (!first.ok) return;
    const started = first.subscription.loyaltyStartedAt;
    assert.equal(first.subscription.billingInterval, "MONTHLY");

    const toAnnual = await subscribeWorkspace({ workspaceId: "w2", planTier: "STARTER", interval: "ANNUAL", customerEmail: "a@b.c" }, deps);
    assert.ok(toAnnual.ok && toAnnual.subscription.billingInterval === "ANNUAL");
    assert.ok(toAnnual.ok && toAnnual.subscription.loyaltyStartedAt?.getTime() === started?.getTime());

    const same = await subscribeWorkspace({ workspaceId: "w2", planTier: "STARTER", interval: "ANNUAL", customerEmail: "a@b.c" }, deps);
    assert.ok(same.ok && same.subscription.updatedAt.getTime() === (toAnnual.ok ? toAnnual.subscription.updatedAt.getTime() : 0));

    await cancelSubscription({ workspaceId: "w2" }, deps);
    await new Promise((r) => setTimeout(r, 5));
    const again = await subscribeWorkspace({ workspaceId: "w2", planTier: "STARTER", customerEmail: "a@b.c" }, deps);
    assert.ok(again.ok);
    if (!again.ok) return;
    assert.equal(again.subscription.billingInterval, "MONTHLY");
    assert.ok((again.subscription.loyaltyStartedAt?.getTime() ?? 0) > (started?.getTime() ?? 0));
  });
});
