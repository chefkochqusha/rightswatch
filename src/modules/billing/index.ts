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

export { InMemoryPlanRepository, InMemorySubscriptionRepository } from "./in-memory-repositories";

// `PrismaPlanRepository`/`PrismaSubscriptionRepository` are deliberately
// NOT re-exported here — same reasoning as `modules/notifications/index.ts`:
// they transitively import `@/lib/prisma-client`, which needs the generated
// Prisma client (absent in this build sandbox) and a DB connection string,
// and this barrel is used by every in-memory-only consumer. Import them
// directly from "@/modules/billing/prisma-repositories" once they're wired
// into `app/_lib/billing-store.ts`.

export { MockPaymentProvider, TRIAL_LENGTH_DAYS } from "./mock-payment-provider";

// `StripePaymentProvider` is safe to export from here (unlike
// `PrismaPlanRepository`/`PrismaSubscriptionRepository` above) — importing
// the `stripe` package has no crash-at-load-time risk in this sandbox the
// way the Prisma generated client does. It's just not wired into
// `app/_lib/billing-store.ts` yet; see its own doc comment for why.
export { StripePaymentProvider } from "./stripe-payment-provider";

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
