import {
  InMemoryPlanRepository,
  InMemorySubscriptionRepository,
  MockPaymentProvider,
} from "@/modules/billing";

/**
 * One shared billing store per server process — same rationale and
 * caveats as `auth-store.ts`/`case-store.ts` (Prisma- and Stripe-backed
 * later, cached on `globalThis` for `next dev`, not for production).
 */
interface BillingStore {
  plans: InMemoryPlanRepository;
  subscriptions: InMemorySubscriptionRepository;
  paymentProvider: MockPaymentProvider;
}

const globalForBilling = globalThis as unknown as { __rightswatchBillingStore?: BillingStore };

export function getBillingStore(): BillingStore {
  if (!globalForBilling.__rightswatchBillingStore) {
    globalForBilling.__rightswatchBillingStore = {
      plans: new InMemoryPlanRepository(),
      subscriptions: new InMemorySubscriptionRepository(),
      paymentProvider: new MockPaymentProvider(),
    };
  }
  return globalForBilling.__rightswatchBillingStore;
}
