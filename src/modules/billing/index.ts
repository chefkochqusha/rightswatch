export type {
  PlanTier,
  SubscriptionStatus,
  PlanRecord,
  SubscriptionRecord,
  PlanRepository,
  SubscriptionRepository,
  PaymentProvider,
} from "./types";

export { PLAN_CATALOG } from "./plan-catalog";
export { LOYALTY, annualPriceCents, loyaltyMonth, loyaltyPercent, loyaltyStatus, monthOfMaxDiscount, monthlyPriceCents } from "./loyalty";
export type { BillingInterval } from "./loyalty";

export { InMemoryPlanRepository, InMemorySubscriptionRepository } from "./in-memory-repositories";

// `PrismaPlanRepository`/`PrismaSubscriptionRepository` are deliberately
// NOT re-exported here — same reasoning as `modules/notifications/index.ts`:
// they transitively import `@/lib/prisma-client`, which needs the generated
// Prisma client (absent in this build sandbox) and a DB connection string,
// and this barrel is used by every in-memory-only consumer. Import them
// directly from "@/modules/billing/prisma-repositories" once they're wired
// into `app/_lib/billing-store.ts`.

export { MockPaymentProvider, TRIAL_LENGTH_DAYS } from "./mock-payment-provider";

// `StripePaymentProvider` and the portal adapter are safe to export from
// here (unlike `PrismaPlanRepository`/`PrismaSubscriptionRepository` above)
// — importing the `stripe` package has no crash-at-load-time risk in this
// sandbox the way the Prisma generated client does.
export { StripePaymentProvider } from "./stripe-payment-provider";
export { createStripeBillingPortalSession } from "./stripe-billing-portal";

export {
  STRIPE_PRICE_ID_ENV_VAR,
  isStripeConfigured,
  getPaymentMode,
  missingStripeEnvVars,
  planTierForPriceId,
  isMockCustomerId,
  isMockSubscriptionId,
  RoutingPaymentProvider,
} from "./payment-provider-selection";
export type { PaymentMode } from "./payment-provider-selection";

export {
  mapStripeSubscriptionStatus,
  snapshotFromStripeSubscription,
  syncStripeSubscription,
} from "./stripe-subscription-sync";
export type {
  StripeSubscriptionSnapshot,
  SyncStripeSubscriptionDependencies,
  SyncStripeSubscriptionResult,
} from "./stripe-subscription-sync";

export { handleStripeWebhook, HANDLED_STRIPE_EVENT_TYPES } from "./handle-stripe-webhook";
export type {
  HandleStripeWebhookInput,
  HandleStripeWebhookDependencies,
  HandleStripeWebhookResult,
} from "./handle-stripe-webhook";

export { subscribeWorkspace } from "./subscribe-workspace";
export type {
  SubscribeWorkspaceInput,
  SubscribeWorkspaceDependencies,
  SubscribeWorkspaceResult,
} from "./subscribe-workspace";

export { cancelSubscription } from "./cancel-subscription";
export type {
  CancelSubscriptionInput,
  CancelSubscriptionDependencies,
  CancelSubscriptionResult,
} from "./cancel-subscription";

export { BILLING_COUNTRIES, EU_VAT_PREFIX, HOME_COUNTRY, isEuCountry, normalizeVatId, parseBillingDetails, stripeTaxIdType, taxSituation } from "./billing-details";
export type { BillingDetails, BillingDetailsField, ParseBillingDetailsResult, TaxSituation } from "./billing-details";
export { syncStripeBillingDetails, vatIdStatusFromStripe } from "./stripe-billing-details";
export type { StripeBillingSyncResult, VatIdStatus } from "./stripe-billing-details";
