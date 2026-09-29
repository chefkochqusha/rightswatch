import { MockPaymentProvider } from "@/modules/billing";
import { PrismaPlanRepository, PrismaSubscriptionRepository } from "@/modules/billing/prisma-repositories";

/**
 * One shared billing store per server process. Prisma-backed as of Phase
 * 2 (Neon is live) — `plans` reads the catalog seeded by `prisma/seed.ts`
 * (run on every build) instead of the hardcoded `PLAN_CATALOG` array, and
 * `subscriptions` are durable Postgres rows. Same rationale as
 * `auth-store.ts` for why nothing else needed to change. `paymentProvider`
 * deliberately stays mocked — no real Stripe keys yet, see
 * `modules/billing/types.ts`'s `PaymentProvider` comment.
 */
interface BillingStore {
  plans: PrismaPlanRepository;
  subscriptions: PrismaSubscriptionRepository;
  paymentProvider: MockPaymentProvider;
}

const globalForBilling = globalThis as unknown as { __rightswatchBillingStore?: BillingStore };

export function getBillingStore(): BillingStore {
  if (!globalForBilling.__rightswatchBillingStore) {
    globalForBilling.__rightswatchBillingStore = {
      plans: new PrismaPlanRepository(),
      subscriptions: new PrismaSubscriptionRepository(),
      paymentProvider: new MockPaymentProvider(),
    };
  }
  return globalForBilling.__rightswatchBillingStore;
}
