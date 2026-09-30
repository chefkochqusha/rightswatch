import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { InMemoryPlanRepository, InMemorySubscriptionRepository } from "./in-memory-repositories";
import {
  mapStripeSubscriptionStatus,
  snapshotFromStripeSubscription,
  syncStripeSubscription,
} from "./stripe-subscription-sync";
import type { PlanTier } from "./types";

const TIER_BY_PRICE: Record<string, PlanTier> = {
  price_starter: "STARTER",
  price_growth: "GROWTH",
  price_agency: "AGENCY",
};

async function setup() {
  const subscriptionRepository = new InMemorySubscriptionRepository();
  const planRepository = new InMemoryPlanRepository();
  const existing = await subscriptionRepository.create({
    workspaceId: "workspace-1",
    planId: "plan-starter",
    status: "TRIALING",
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    currentPeriodEnd: new Date("2026-10-14T00:00:00Z"),
  });
  const deps = {
    subscriptionRepository,
    planRepository,
    planTierForPriceId: (priceId: string) => TIER_BY_PRICE[priceId] ?? null,
  };
  return { deps, existing, subscriptionRepository };
}

describe("mapStripeSubscriptionStatus", () => {
  const cases: [string, string | null][] = [
    ["trialing", "TRIALING"],
    ["active", "ACTIVE"],
    ["past_due", "PAST_DUE"],
    ["unpaid", "PAST_DUE"],
    ["incomplete", "PAST_DUE"],
    ["paused", "PAST_DUE"],
    ["canceled", "CANCELED"],
    ["incomplete_expired", "CANCELED"],
    ["some_future_status", null],
  ];
  for (const [stripe, ours] of cases) {
    test(`${stripe} → ${ours}`, () => {
      assert.equal(mapStripeSubscriptionStatus(stripe), ours);
    });
  }
});

describe("snapshotFromStripeSubscription", () => {
  test("reads price and billing period off the first subscription item (basil API shape)", () => {
    const subscription = {
      id: "sub_1",
      status: "active",
      items: { data: [{ id: "si_1", price: { id: "price_growth" }, current_period_end: 1_792_000_000 }] },
    } as unknown as Stripe.Subscription;
    assert.deepEqual(snapshotFromStripeSubscription(subscription), {
      stripeSubscriptionId: "sub_1",
      status: "active",
      priceId: "price_growth",
      currentPeriodEnd: new Date(1_792_000_000 * 1000),
    });
  });

  test("a subscription with no items yields nulls, not a crash", () => {
    const subscription = { id: "sub_1", status: "canceled", items: { data: [] } } as unknown as Stripe.Subscription;
    const snapshot = snapshotFromStripeSubscription(subscription);
    assert.equal(snapshot.priceId, null);
    assert.equal(snapshot.currentPeriodEnd, null);
  });
});

describe("syncStripeSubscription", () => {
  test("a subscription this app doesn't know is ignored", async () => {
    const { deps } = await setup();
    const result = await syncStripeSubscription(
      { stripeSubscriptionId: "sub_someone_else", status: "active", priceId: null, currentPeriodEnd: null },
      deps,
    );
    assert.deepEqual(result, { outcome: "ignored", reason: "UNKNOWN_SUBSCRIPTION" });
  });

  test("trial converting to paid: status and period both follow Stripe", async () => {
    const { deps, existing } = await setup();
    const renewal = new Date("2026-11-14T00:00:00Z");
    const result = await syncStripeSubscription(
      { stripeSubscriptionId: "sub_1", status: "active", priceId: "price_starter", currentPeriodEnd: renewal },
      deps,
    );
    assert.equal(result.outcome, "updated");
    if (result.outcome !== "updated") return;
    assert.equal(result.subscription.id, existing.id);
    assert.equal(result.subscription.status, "ACTIVE");
    assert.deepEqual(result.subscription.currentPeriodEnd, renewal);
    assert.equal(result.subscription.planId, "plan-starter", "same price → same plan");
    assert.deepEqual(result.changed.sort(), ["currentPeriodEnd", "status"]);
  });

  test("a plan switch made in the Customer Portal moves the plan", async () => {
    const { deps } = await setup();
    const result = await syncStripeSubscription(
      {
        stripeSubscriptionId: "sub_1",
        status: "trialing",
        priceId: "price_agency",
        currentPeriodEnd: new Date("2026-10-14T00:00:00Z"),
      },
      deps,
    );
    assert.equal(result.outcome, "updated");
    if (result.outcome !== "updated") return;
    assert.equal(result.subscription.planId, "plan-agency");
    assert.deepEqual(result.changed, ["planId"]);
  });

  test("an unrecognized price or status leaves those fields exactly as they were", async () => {
    const { deps } = await setup();
    const result = await syncStripeSubscription(
      {
        stripeSubscriptionId: "sub_1",
        status: "some_future_status",
        priceId: "price_unknown",
        currentPeriodEnd: new Date("2026-10-14T00:00:00Z"),
      },
      deps,
    );
    assert.equal(result.outcome, "unchanged");
    if (result.outcome !== "unchanged") return;
    assert.equal(result.subscription.status, "TRIALING");
    assert.equal(result.subscription.planId, "plan-starter");
  });

  test("the same snapshot twice is a no-op the second time (absolute state, not a delta)", async () => {
    const { deps } = await setup();
    const snapshot = {
      stripeSubscriptionId: "sub_1",
      status: "past_due",
      priceId: "price_starter",
      currentPeriodEnd: new Date("2026-10-14T00:00:00Z"),
    };
    assert.equal((await syncStripeSubscription(snapshot, deps)).outcome, "updated");
    assert.equal((await syncStripeSubscription(snapshot, deps)).outcome, "unchanged");
  });

  test("an event about a subscription the workspace has since replaced never touches the new one", async () => {
    const { deps, existing, subscriptionRepository } = await setup();
    await subscriptionRepository.update(existing.id, { stripeSubscriptionId: "sub_2", status: "TRIALING" });

    const result = await syncStripeSubscription(
      { stripeSubscriptionId: "sub_1", status: "canceled", priceId: null, currentPeriodEnd: null },
      deps,
    );
    assert.equal(result.outcome, "ignored");
    assert.equal((await subscriptionRepository.findByWorkspaceId("workspace-1"))?.status, "TRIALING");
  });
});
