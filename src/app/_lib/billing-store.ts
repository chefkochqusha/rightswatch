import {
  getPaymentMode,
  MockPaymentProvider,
  RoutingPaymentProvider,
  StripePaymentProvider,
} from "@/modules/billing";
import type { PaymentMode, PaymentProvider, PlanRepository, SubscriptionRepository } from "@/modules/billing";
import { PrismaPlanRepository, PrismaSubscriptionRepository } from "@/modules/billing/prisma-repositories";

/**
 * One shared billing store per server process. `plans` reads the catalog
 * seeded by `prisma/seed.ts` (run on every build); `subscriptions` are
 * durable Postgres rows.
 *
 * `paymentProvider` is chosen from the environment, never hand-wired
 * (`modules/billing/payment-provider-selection.ts`): every Stripe variable
 * set → real Stripe test mode, with anything a workspace started under the
 * mock still routed to the mock; anything missing → `MockPaymentProvider`,
 * clearly labeled as demo billing on the billing page (Master Brief §76).
 * Vercel only applies changed env vars to a new deployment, so setting the
 * keys means a redeploy — after which this picks them up with no code
 * change.
 */
interface BillingStore {
  plans: PlanRepository;
  subscriptions: SubscriptionRepository;
  paymentProvider: PaymentProvider;
  mode: PaymentMode;
}

const globalForBilling = globalThis as unknown as { __rightswatchBillingStore?: BillingStore };

export function getBillingStore(): BillingStore {
  if (!globalForBilling.__rightswatchBillingStore) {
    const mode = getPaymentMode(process.env);
    globalForBilling.__rightswatchBillingStore = {
      plans: new PrismaPlanRepository(),
      subscriptions: new PrismaSubscriptionRepository(),
      paymentProvider:
        mode === "stripe"
          ? new RoutingPaymentProvider(new StripePaymentProvider(), new MockPaymentProvider())
          : new MockPaymentProvider(),
      mode,
    };
  }
  return globalForBilling.__rightswatchBillingStore;
}
