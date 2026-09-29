import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { subscribeWorkspace } from "./subscribe-workspace";
import { cancelSubscription } from "./cancel-subscription";
import { InMemoryPlanRepository, InMemorySubscriptionRepository } from "./in-memory-repositories";
import { MockPaymentProvider } from "./mock-payment-provider";

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
