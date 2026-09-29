import type { PaymentProvider, SubscriptionRecord, SubscriptionRepository } from "./types";

export interface CancelSubscriptionInput {
  workspaceId: string;
}

export interface CancelSubscriptionDependencies {
  subscriptionRepository: SubscriptionRepository;
  paymentProvider: PaymentProvider;
}

export type CancelSubscriptionResult =
  | { ok: true; subscription: SubscriptionRecord }
  | { ok: false; error: "NO_SUBSCRIPTION" };

export async function cancelSubscription(
  input: CancelSubscriptionInput,
  deps: CancelSubscriptionDependencies,
): Promise<CancelSubscriptionResult> {
  const existing = await deps.subscriptionRepository.findByWorkspaceId(input.workspaceId);
  if (!existing || !existing.stripeSubscriptionId) {
    return { ok: false, error: "NO_SUBSCRIPTION" };
  }

  // Already canceled: idempotent no-op, same reasoning as openCase/
  // subscribeWorkspace — a repeat click shouldn't error.
  if (existing.status === "CANCELED") {
    return { ok: true, subscription: existing };
  }

  await deps.paymentProvider.cancelSubscription(existing.stripeSubscriptionId);
  const subscription = await deps.subscriptionRepository.update(existing.id, { status: "CANCELED" });

  return { ok: true, subscription };
}
