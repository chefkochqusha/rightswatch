import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { InMemoryPlanRepository, InMemorySubscriptionRepository } from "./in-memory-repositories";

describe("InMemoryPlanRepository", () => {
  test("finds a plan by tier", async () => {
    const repo = new InMemoryPlanRepository();
    const plan = await repo.findByTier("GROWTH");
    assert.equal(plan?.name, "Growth");
  });

  test("returns null for an unknown id", async () => {
    const repo = new InMemoryPlanRepository();
    assert.equal(await repo.findById("no-such-plan"), null);
  });

  test("findAll returns every catalog plan", async () => {
    const repo = new InMemoryPlanRepository();
    const plans = await repo.findAll();
    assert.equal(plans.length, 3);
  });
});

describe("InMemorySubscriptionRepository", () => {
  test("creates and finds a subscription by workspace id", async () => {
    const repo = new InMemorySubscriptionRepository();
    const created = await repo.create({
      workspaceId: "workspace-1",
      planId: "plan-starter",
      status: "TRIALING",
      stripeCustomerId: "cus_mock_1",
      stripeSubscriptionId: "sub_mock_1",
      currentPeriodEnd: new Date("2026-10-12"),
    });
    assert.equal(created.workspaceId, "workspace-1");

    const found = await repo.findByWorkspaceId("workspace-1");
    assert.deepEqual(found, created);
  });

  test("returns null for a workspace with no subscription", async () => {
    const repo = new InMemorySubscriptionRepository();
    assert.equal(await repo.findByWorkspaceId("no-such-workspace"), null);
  });

  test("refuses a second subscription for the same workspace (workspaceId is 1:1)", async () => {
    const repo = new InMemorySubscriptionRepository();
    await repo.create({
      workspaceId: "workspace-1",
      planId: "plan-starter",
      status: "TRIALING",
      stripeCustomerId: "cus_mock_1",
      stripeSubscriptionId: "sub_mock_1",
      currentPeriodEnd: null,
    });
    await assert.rejects(() =>
      repo.create({
        workspaceId: "workspace-1",
        planId: "plan-growth",
        status: "TRIALING",
        stripeCustomerId: "cus_mock_2",
        stripeSubscriptionId: "sub_mock_2",
        currentPeriodEnd: null,
      }),
    );
  });

  test("update patches only the given fields", async () => {
    const repo = new InMemorySubscriptionRepository();
    const created = await repo.create({
      workspaceId: "workspace-1",
      planId: "plan-starter",
      status: "TRIALING",
      stripeCustomerId: "cus_mock_1",
      stripeSubscriptionId: "sub_mock_1",
      currentPeriodEnd: null,
    });

    const updated = await repo.update(created.id, { status: "ACTIVE" });
    assert.equal(updated.status, "ACTIVE");
    assert.equal(updated.planId, "plan-starter", "planId untouched");
    assert.ok(updated.updatedAt.getTime() >= created.updatedAt.getTime());
  });

  test("update throws for an id that doesn't exist", async () => {
    const repo = new InMemorySubscriptionRepository();
    await assert.rejects(() => repo.update("no-such-subscription", { status: "CANCELED" }));
  });

  test("findByStripeSubscriptionId matches the row's current Stripe subscription only", async () => {
    const repo = new InMemorySubscriptionRepository();
    const created = await repo.create({
      workspaceId: "workspace-1",
      planId: "plan-starter",
      status: "CANCELED",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_old",
      currentPeriodEnd: null,
    });
    // Resubscribed: same row and customer, new Stripe subscription.
    await repo.update(created.id, { status: "TRIALING", stripeSubscriptionId: "sub_new" });

    assert.equal((await repo.findByStripeSubscriptionId("sub_new"))?.id, created.id);
    assert.equal(await repo.findByStripeSubscriptionId("sub_old"), null);
  });
});
