"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceManager } from "@/app/_lib/authorize";
import { getBillingStore } from "@/app/_lib/billing-store";
import { subscribeWorkspace, cancelSubscription } from "@/modules/billing";
import type { PlanTier } from "@/modules/billing";

const PLAN_TIERS: PlanTier[] = ["STARTER", "GROWTH", "AGENCY"];

/**
 * Backs every "Start free trial" / "Switch to this plan" button on the
 * billing page — `subscribeWorkspace` itself decides whether that means a
 * fresh subscribe, a plan switch, or a resubscribe (see its doc comment).
 * Restricted to OWNER/ADMIN (`requireWorkspaceManager`) — an ANALYST or
 * VIEWER can see the plan (Master Brief gives them workspace access, not
 * workspace control) but not change or cancel it.
 */
export async function choosePlanAction(formData: FormData) {
  const rawTier = String(formData.get("planTier") ?? "");
  if (!PLAN_TIERS.includes(rawTier as PlanTier)) {
    throw new Error(`Unrecognized plan tier: ${rawTier}`);
  }
  const session = await requireWorkspaceManager();
  const store = getBillingStore();
  await subscribeWorkspace(
    {
      workspaceId: session.workspace.id,
      planTier: rawTier as PlanTier,
      customerEmail: session.user.email,
    },
    {
      planRepository: store.plans,
      subscriptionRepository: store.subscriptions,
      paymentProvider: store.paymentProvider,
    },
  );
  revalidatePath("/workspace/billing");
  revalidatePath("/workspace");
}

export async function cancelSubscriptionAction() {
  const session = await requireWorkspaceManager();
  const store = getBillingStore();
  await cancelSubscription(
    { workspaceId: session.workspace.id },
    { subscriptionRepository: store.subscriptions, paymentProvider: store.paymentProvider },
  );
  revalidatePath("/workspace/billing");
  revalidatePath("/workspace");
}
