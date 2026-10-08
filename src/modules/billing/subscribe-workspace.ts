import type {
  BillingInterval,
  PaymentProvider,
  PlanRepository,
  PlanTier,
  SubscriptionRecord,
  SubscriptionRepository,
} from "./types";

export interface SubscribeWorkspaceInput {
  workspaceId: string;
  planTier: PlanTier;
  /** Monthly (loyalty discount grows month by month) or annual (maximum discount from the start). Default monthly. */
  interval?: BillingInterval;
  /** Used whenever a payment-provider customer has to be created: the first
   *  time a workspace subscribes, or a resubscribe whose stored customer
   *  the current provider can't bill. Ignored otherwise, since the existing
   *  `stripeCustomerId` is reused. */
  customerEmail: string;
}

export interface SubscribeWorkspaceDependencies {
  planRepository: PlanRepository;
  subscriptionRepository: SubscriptionRepository;
  paymentProvider: PaymentProvider;
}

export type SubscribeWorkspaceResult =
  | { ok: true; subscription: SubscriptionRecord }
  | { ok: false; error: "PLAN_NOT_FOUND" };

/**
 * One function covers the whole "pick a plan" surface — a fresh subscribe,
 * switching plans while active/trialing, and resubscribing after a
 * cancellation — because a real Stripe integration would model all three
 * as "make the subscription match this plan," not as three separate
 * flows. Idempotent when nothing would change, the same idempotency theme
 * already used for `openCase`.
 */
export async function subscribeWorkspace(
  input: SubscribeWorkspaceInput,
  deps: SubscribeWorkspaceDependencies,
): Promise<SubscribeWorkspaceResult> {
  const plan = await deps.planRepository.findByTier(input.planTier);
  if (!plan) {
    return { ok: false, error: "PLAN_NOT_FOUND" };
  }

  const existing = await deps.subscriptionRepository.findByWorkspaceId(input.workspaceId);
  const interval: BillingInterval = input.interval ?? "MONTHLY";

  // No subscription yet, or a previously canceled one: (re)create it with
  // the payment provider. A canceled subscription's customer id is reused
  // — in real Stripe, the Customer object outlives a canceled Subscription
  // — as long as the current provider can bill it. One that can't (a
  // demo-era `cus_mock_…` id after the switch to Stripe) is replaced by a
  // fresh customer, which is how a demo-era workspace moves to real billing.
  if (!existing || existing.status === "CANCELED") {
    const reusableCustomerId =
      existing && deps.paymentProvider.canReuseCustomer(existing.stripeCustomerId)
        ? existing.stripeCustomerId
        : null;
    const customerId =
      reusableCustomerId ??
      (await deps.paymentProvider.createCustomer({ email: input.customerEmail, workspaceId: input.workspaceId }))
        .customerId;

    const { subscriptionId, currentPeriodEnd } = await deps.paymentProvider.createSubscription({
      customerId,
      planTier: input.planTier,
      interval,
    });
    // Loyalty month 1 starts when the free trial ends; a new subscription after
    // cancelling starts the clock again.
    const loyaltyStartedAt = currentPeriodEnd;

    const subscription = existing
      ? await deps.subscriptionRepository.update(existing.id, {
          planId: plan.id,
          status: "TRIALING",
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          currentPeriodEnd,
          billingInterval: interval,
          loyaltyStartedAt,
        })
      : await deps.subscriptionRepository.create({
          workspaceId: input.workspaceId,
          planId: plan.id,
          status: "TRIALING",
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          currentPeriodEnd,
          billingInterval: interval,
          loyaltyStartedAt,
        });

    return { ok: true, subscription };
  }

  // Already on this exact plan: no-op. The UI disables this case (the
  // current plan's button is disabled), but a hand-crafted request should
  // still get back the current state rather than an error.
  if (existing.planId === plan.id && existing.billingInterval === interval) {
    return { ok: true, subscription: existing };
  }

  // Active or trialing on a *different* plan: a plan change, not a new
  // subscription. `stripeSubscriptionId` is always set once a subscription
  // reaches ACTIVE/TRIALING (both only ever come from the branch above),
  // so this is safe.
  await deps.paymentProvider.changeSubscriptionPlan({
    subscriptionId: existing.stripeSubscriptionId!,
    planTier: input.planTier,
    interval,
  });
  // A plan or interval change keeps the loyalty clock running.
  const subscription = await deps.subscriptionRepository.update(existing.id, { planId: plan.id, billingInterval: interval });

  return { ok: true, subscription };
}
