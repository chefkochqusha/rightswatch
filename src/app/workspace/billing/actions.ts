"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAudit } from "@/app/_lib/audit-event";
import { requireWorkspaceManager } from "@/app/_lib/authorize";
import { getBillingStore } from "@/app/_lib/billing-store";
import { getCreatorStore } from "@/app/_lib/creator-store";
import {
  subscribeWorkspace,
  cancelSubscription,
  createStripeBillingPortalSession,
  isMockCustomerId,
} from "@/modules/billing";
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

  // A plan smaller than what's already monitored would leave creators over
  // its limit (Brief §19). The page doesn't offer that switch; this refuses
  // a stale or forged one.
  const plan = await store.plans.findByTier(rawTier as PlanTier);
  const monitored = await getCreatorStore().creators.countMonitored(session.workspace.id);
  if (plan && plan.creatorCap < monitored) {
    throw new Error(`${plan.name} allows ${plan.creatorCap} creators; this workspace monitors ${monitored}.`);
  }

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
  await recordAudit({ workspaceId: session.workspace.id, actorId: session.user.id, action: "billing.plan_chosen", targetType: "plan", targetId: rawTier });
  revalidatePath("/workspace", "layout");
}

export async function cancelSubscriptionAction() {
  const session = await requireWorkspaceManager();
  const store = getBillingStore();
  await cancelSubscription(
    { workspaceId: session.workspace.id },
    { subscriptionRepository: store.subscriptions, paymentProvider: store.paymentProvider },
  );
  await recordAudit({ workspaceId: session.workspace.id, actorId: session.user.id, action: "billing.canceled", targetType: "subscription", targetId: session.workspace.id });
  revalidatePath("/workspace/billing");
  revalidatePath("/workspace");
}

/**
 * "Manage billing & invoices" (Master Brief §18 customer portal, §20):
 * hands the workspace's Stripe customer to Stripe's hosted portal and sends
 * the browser there. Only offered — and only allowed — for a real Stripe
 * customer: a mock-era subscription has nothing on Stripe's side to manage.
 */
export async function openBillingPortalAction() {
  const session = await requireWorkspaceManager();
  const store = getBillingStore();
  const subscription = await store.subscriptions.findByWorkspaceId(session.workspace.id);
  if (store.mode !== "stripe" || !subscription || isMockCustomerId(subscription.stripeCustomerId)) {
    throw new Error("This workspace has no Stripe billing account to manage.");
  }

  // Back to this same deployment's billing page — works unchanged on the
  // production domain, a preview URL, or a custom domain added later.
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const { url } = await createStripeBillingPortalSession({
    customerId: subscription.stripeCustomerId,
    returnUrl: `${protocol}://${host}/workspace/billing`,
  });

  // Outside any try/catch, per the `redirect` docs: it works by throwing.
  redirect(url);
}
