import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MockPaymentProvider } from "./mock-payment-provider";

describe("MockPaymentProvider", () => {
  test("createCustomer returns a distinct, clearly-mock id each call", async () => {
    const provider = new MockPaymentProvider();
    const a = await provider.createCustomer({ email: "a@example.com", workspaceId: "w1" });
    const b = await provider.createCustomer({ email: "b@example.com", workspaceId: "w2" });
    assert.notEqual(a.customerId, b.customerId);
    assert.match(a.customerId, /^cus_mock_/);
  });

  test("createSubscription returns a future currentPeriodEnd", async () => {
    const provider = new MockPaymentProvider();
    const before = Date.now();
    const { subscriptionId, currentPeriodEnd } = await provider.createSubscription({
      customerId: "cus_mock_1",
      planTier: "STARTER",
    });
    assert.match(subscriptionId, /^sub_mock_/);
    assert.ok(currentPeriodEnd.getTime() > before);
  });

  test("canReuseCustomer accepts any stored id — the mock never looks at the customer", () => {
    const provider = new MockPaymentProvider();
    assert.equal(provider.canReuseCustomer("cus_mock_1"), true);
    assert.equal(provider.canReuseCustomer("cus_RealStripe1"), true);
  });

  test("changeSubscriptionPlan and cancelSubscription resolve without throwing", async () => {
    const provider = new MockPaymentProvider();
    await assert.doesNotReject(() =>
      provider.changeSubscriptionPlan({ subscriptionId: "sub_mock_1", planTier: "GROWTH" }),
    );
    await assert.doesNotReject(() => provider.cancelSubscription("sub_mock_1"));
  });
});
