import type { CreatorAllowance } from "@/modules/creators";
import { getBillingStore } from "./billing-store";

/**
 * How many creators the workspace's plan lets it monitor (Brief §19) — the
 * one place a plan's limit is read. A trialing, active or past-due
 * subscription carries its plan's limit (a failed payment is Stripe's to
 * retry, not a reason to stop monitoring mid-retry); no subscription, or a
 * canceled one, allows none.
 */
export async function getCreatorAllowance(workspaceId: string): Promise<CreatorAllowance> {
  const billing = getBillingStore();
  const subscription = await billing.subscriptions.findByWorkspaceId(workspaceId);
  if (!subscription || subscription.status === "CANCELED") return { cap: 0, planName: null };
  const plan = await billing.plans.findById(subscription.planId);
  return plan ? { cap: plan.creatorCap, planName: plan.name } : { cap: 0, planName: null };
}
