"use server";

import { getAuthStore } from "@/app/_lib/auth-store";
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
  parseBillingDetails,
} from "@/modules/billing";
import type { BillingDetailsField, PlanTier } from "@/modules/billing";
import { findBillingProfile, saveBillingProfile, syncBillingProfileToStripe } from "@/app/_lib/billing-profile";

const PLAN_TIERS: PlanTier[] = ["SOLO", "STARTER", "GROWTH", "AGENCY"];

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
  const interval = formData.get("billingInterval") === "ANNUAL" ? "ANNUAL" : "MONTHLY";
  const session = await requireWorkspaceManager();
  const store = getBillingStore();

  // Invoices need the company's name and address, and asking for them is how
  // "businesses only" gets checked (LEGAL_DE.md). The page asks first; this
  // refuses a request that skipped it.
  if (!(await findBillingProfile(session.workspace.id))) {
    throw new Error("Add your company details before choosing a plan.");
  }

  // A plan smaller than what's already monitored would leave creators over
  // its limit (Brief §19). The page doesn't offer that switch; this refuses
  // a stale or forged one.
  const plan = await store.plans.findByTier(rawTier as PlanTier);
  const monitored = await getCreatorStore().creators.countMonitored(session.workspace.id);
  if (plan && plan.creatorCap < monitored) {
    throw new Error(`${plan.name} allows ${plan.creatorCap} creators; this workspace monitors ${monitored}.`);
  }
  const members = (await getAuthStore().memberships.findForWorkspace(session.workspace.id)).length;
  if (plan && plan.seatCap < members) {
    throw new Error(`${plan.name} has ${plan.seatCap} seats; this workspace has ${members} members.`);
  }

  await subscribeWorkspace(
    {
      workspaceId: session.workspace.id,
      planTier: rawTier as PlanTier,
      interval,
      customerEmail: session.user.email,
    },
    {
      planRepository: store.plans,
      subscriptionRepository: store.subscriptions,
      paymentProvider: store.paymentProvider,
    },
  );
  // A new Stripe customer gets the company details and VAT ID now.
  await syncBillingProfileToStripe(session.workspace.id);
  await recordAudit({ workspaceId: session.workspace.id, actorId: session.user.id, action: "billing.plan_chosen", targetType: "plan", targetId: rawTier, metadata: { interval } });
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

const BILLING_FIELDS: BillingDetailsField[] = ["companyName", "addressLine1", "addressLine2", "postalCode", "city", "country", "vatId"];

export interface BillingDetailsState {
  /** Changes on every submit, so the form remounts with `values`. */
  attempt?: number;
  values?: Partial<Record<BillingDetailsField, string>>;
  fieldErrors?: Partial<Record<BillingDetailsField, string>>;
  saved?: boolean;
}

/** The company details form on the billing page (owners and admins). */
export async function saveBillingDetailsAction(_previous: BillingDetailsState, formData: FormData): Promise<BillingDetailsState> {
  const session = await requireWorkspaceManager();
  const values = Object.fromEntries(BILLING_FIELDS.map((field) => [field, String(formData.get(field) ?? "")]));
  const attempt = Date.now();
  const parsed = parseBillingDetails(values);
  if (!parsed.ok) return { attempt, values, fieldErrors: parsed.errors };

  await saveBillingProfile({ workspaceId: session.workspace.id, details: parsed.details, actorId: session.user.id });
  // No address or VAT ID in the log: which fields changed is enough to trace it.
  await recordAudit({
    workspaceId: session.workspace.id,
    actorId: session.user.id,
    action: "billing.details_updated",
    targetType: "workspace",
    targetId: session.workspace.id,
    metadata: { country: parsed.details.country, vatId: parsed.details.vatId ? "given" : "none" },
  });
  revalidatePath("/workspace/billing");
  return { attempt, saved: true };
}
