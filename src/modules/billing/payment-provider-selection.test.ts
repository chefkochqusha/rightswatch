import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getPaymentMode,
  isMockCustomerId,
  isMockSubscriptionId,
  isStripeConfigured,
  missingStripeEnvVars,
  planTierForPriceId,
  RoutingPaymentProvider,
} from "./payment-provider-selection";
import type { PaymentProvider, PlanTier } from "./types";

const FULL_ENV = {
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  STRIPE_PRICE_ID_STARTER: "price_starter",
  STRIPE_PRICE_ID_GROWTH: "price_growth",
  STRIPE_PRICE_ID_AGENCY: "price_agency",
};

describe("isStripeConfigured / getPaymentMode", () => {
  test("every variable set → stripe", () => {
    assert.equal(isStripeConfigured(FULL_ENV), true);
    assert.equal(getPaymentMode(FULL_ENV), "stripe");
  });

  test("nothing set → mock", () => {
    assert.equal(getPaymentMode({}), "mock");
  });

  for (const name of Object.keys(FULL_ENV)) {
    test(`missing ${name} alone keeps the app on the mock`, () => {
      const env: Record<string, string | undefined> = { ...FULL_ENV };
      delete env[name];
      assert.equal(getPaymentMode(env), "mock");
    });
  }

  test("a blank or whitespace-only value counts as missing (a common copy-paste slip in a dashboard)", () => {
    assert.equal(getPaymentMode({ ...FULL_ENV, STRIPE_WEBHOOK_SECRET: "   " }), "mock");
  });

  test("missingStripeEnvVars names exactly what's left, never values", () => {
    assert.deepEqual(missingStripeEnvVars({ STRIPE_SECRET_KEY: "sk_test_123" }), [
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_ID_STARTER",
      "STRIPE_PRICE_ID_GROWTH",
      "STRIPE_PRICE_ID_AGENCY",
    ]);
    assert.deepEqual(missingStripeEnvVars(FULL_ENV), []);
  });
});

describe("planTierForPriceId", () => {
  test("maps each configured Price id back to its tier", () => {
    assert.equal(planTierForPriceId("price_starter", FULL_ENV), "STARTER");
    assert.equal(planTierForPriceId("price_growth", FULL_ENV), "GROWTH");
    assert.equal(planTierForPriceId("price_agency", FULL_ENV), "AGENCY");
  });

  test("an unknown Price id is null, not a guess", () => {
    assert.equal(planTierForPriceId("price_someone_elses", FULL_ENV), null);
  });

  test("tolerates stray whitespace around a configured id", () => {
    assert.equal(planTierForPriceId("price_growth", { STRIPE_PRICE_ID_GROWTH: " price_growth \n" }), "GROWTH");
  });
});

describe("mock id detection", () => {
  test("recognizes MockPaymentProvider's prefixes and nothing else", () => {
    assert.equal(isMockCustomerId("cus_mock_abc"), true);
    assert.equal(isMockCustomerId("cus_NfFq8XyZ"), false);
    assert.equal(isMockSubscriptionId("sub_mock_abc"), true);
    assert.equal(isMockSubscriptionId("sub_1Qx7"), false);
  });
});

/** Records which provider each call reached. */
function recordingProvider(name: string, calls: string[]): PaymentProvider {
  return {
    async createCustomer() {
      calls.push(`${name}.createCustomer`);
      return { customerId: name === "mock" ? "cus_mock_new" : "cus_real_new" };
    },
    async createSubscription(input: { customerId: string; planTier: PlanTier }) {
      calls.push(`${name}.createSubscription:${input.customerId}`);
      return { subscriptionId: `${name}_sub`, currentPeriodEnd: new Date() };
    },
    async changeSubscriptionPlan(input: { subscriptionId: string; planTier: PlanTier }) {
      calls.push(`${name}.changeSubscriptionPlan:${input.subscriptionId}`);
    },
    async cancelSubscription(subscriptionId: string) {
      calls.push(`${name}.cancelSubscription:${subscriptionId}`);
    },
    // Same rule as the real providers: the mock bills anything, the real
    // one never a mock id.
    canReuseCustomer(customerId: string) {
      return name === "mock" || !isMockCustomerId(customerId);
    },
  };
}

describe("RoutingPaymentProvider", () => {
  test("a brand-new customer always goes to the real provider", async () => {
    const calls: string[] = [];
    const router = new RoutingPaymentProvider(recordingProvider("real", calls), recordingProvider("mock", calls));
    await router.createCustomer({ email: "nina@example.com", workspaceId: "w1" });
    assert.deepEqual(calls, ["real.createCustomer"]);
  });

  test("a mock-era customer can't be reused once on Stripe, so subscribeWorkspace mints a real one", () => {
    const router = new RoutingPaymentProvider(recordingProvider("real", []), recordingProvider("mock", []));
    assert.equal(router.canReuseCustomer("cus_mock_old"), false);
    assert.equal(router.canReuseCustomer("cus_Real123"), true);
  });

  test("createSubscription never hands a mock customer id to the real provider (guard for callers that don't ask first)", async () => {
    const calls: string[] = [];
    const router = new RoutingPaymentProvider(recordingProvider("real", calls), recordingProvider("mock", calls));
    await router.createSubscription({ customerId: "cus_mock_old", planTier: "STARTER" });
    await router.createSubscription({ customerId: "cus_Real123", planTier: "STARTER" });
    assert.deepEqual(calls, [
      "mock.createSubscription:cus_mock_old",
      "real.createSubscription:cus_Real123",
    ]);
  });

  test("plan changes and cancels route by subscription id — a mock id never reaches Stripe", async () => {
    const calls: string[] = [];
    const router = new RoutingPaymentProvider(recordingProvider("real", calls), recordingProvider("mock", calls));
    await router.changeSubscriptionPlan({ subscriptionId: "sub_mock_1", planTier: "GROWTH" });
    await router.changeSubscriptionPlan({ subscriptionId: "sub_Real1", planTier: "GROWTH" });
    await router.cancelSubscription("sub_mock_1");
    await router.cancelSubscription("sub_Real1");
    assert.deepEqual(calls, [
      "mock.changeSubscriptionPlan:sub_mock_1",
      "real.changeSubscriptionPlan:sub_Real1",
      "mock.cancelSubscription:sub_mock_1",
      "real.cancelSubscription:sub_Real1",
    ]);
  });
});
