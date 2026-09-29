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

describe("cancelSubscription", () => {
  test("cancels an active subscription", async () => {
    const deps = makeDeps();
    await subscribeWorkspace(
      { workspaceId: "workspace-1", planTier: "STARTER", customerEmail: "owner@example.com" },
      deps,
    );
    const result = await cancelSubscription({ workspaceId: "workspace-1" }, deps);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.subscription.status, "CANCELED");
  });

  test("fails when the workspace has no subscription at all", async () => {
    const deps = makeDeps();
    const result = await cancelSubscription({ workspaceId: "no-such-workspace" }, deps);
    assert.deepEqual(result, { ok: false, error: "NO_SUBSCRIPTION" });
  });

  test("canceling an already-canceled subscription is an idempotent no-op", async () => {
    const deps = makeDeps();
    await subscribeWorkspace(
      { workspaceId: "workspace-1", planTier: "STARTER", customerEmail: "owner@example.com" },
      deps,
    );
    const first = await cancelSubscription({ workspaceId: "workspace-1" }, deps);
    const second = await cancelSubscription({ workspaceId: "workspace-1" }, deps);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.deepEqual(second.subscription, first.subscription);
  });
});
