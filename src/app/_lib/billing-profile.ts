import { getPrisma } from "@/lib/prisma-client";
import { getBillingStore } from "@/app/_lib/billing-store";
import { log } from "@/app/_lib/log";
import { isMockCustomerId, syncStripeBillingDetails, vatIdStatusFromStripe } from "@/modules/billing";
import type { BillingDetails, VatIdStatus } from "@/modules/billing";
import type Stripe from "stripe";

/**
 * A workspace's company details for invoices (`modules/billing/billing-details.ts`)
 * and keeping them in step with the Stripe customer.
 */
export interface BillingProfile extends BillingDetails {
  workspaceId: string;
  updatedById: string | null;
  vatIdStatus: VatIdStatus;
  vatIdVerifiedName: string | null;
  stripeTaxIdId: string | null;
  updatedAt: Date;
}

export async function findBillingProfile(workspaceId: string): Promise<BillingProfile | null> {
  return getPrisma().billingProfile.findUnique({ where: { workspaceId } });
}

/** The Stripe customer to keep in step, if this workspace has a real one. */
async function stripeCustomerId(workspaceId: string): Promise<string | null> {
  const store = getBillingStore();
  if (store.mode !== "stripe") return null;
  const subscription = await store.subscriptions.findByWorkspaceId(workspaceId);
  return subscription && !isMockCustomerId(subscription.stripeCustomerId) ? subscription.stripeCustomerId : null;
}

/**
 * Saves the details and, when the workspace already has a Stripe customer,
 * puts them on it (name, address, VAT ID for the VIES check). Without one the
 * VAT ID is only shape-checked until the first plan creates the customer
 * (`syncBillingProfileToStripe`).
 */
export async function saveBillingProfile(input: { workspaceId: string; details: BillingDetails; actorId: string }): Promise<BillingProfile> {
  const prisma = getPrisma();
  const previous = await findBillingProfile(input.workspaceId);
  const vatChanged = previous?.vatId !== input.details.vatId;
  const data = {
    ...input.details,
    updatedById: input.actorId,
    // Until Stripe answers: shape only (or nothing to check).
    ...(vatChanged || !previous ? { vatIdStatus: (input.details.vatId ? "FORMAT_OK" : "NONE") as VatIdStatus, vatIdVerifiedName: null } : {}),
  };
  let profile = await prisma.billingProfile.upsert({
    where: { workspaceId: input.workspaceId },
    create: { workspaceId: input.workspaceId, ...data },
    update: data,
  });
  const customerId = await stripeCustomerId(input.workspaceId);
  if (customerId) profile = await syncToStripe(customerId, profile, previous);
  return profile;
}

/** After a plan creates the Stripe customer: put the saved details on it. */
export async function syncBillingProfileToStripe(workspaceId: string): Promise<void> {
  const profile = await findBillingProfile(workspaceId);
  const customerId = await stripeCustomerId(workspaceId);
  if (profile && customerId) await syncToStripe(customerId, profile, profile);
}

async function syncToStripe(customerId: string, profile: BillingProfile, previous: BillingProfile | null): Promise<BillingProfile> {
  try {
    const result = await syncStripeBillingDetails({
      customerId,
      details: profile,
      previous: { vatId: previous?.vatId ?? null, stripeTaxIdId: previous?.stripeTaxIdId ?? null },
    });
    return await getPrisma().billingProfile.update({ where: { workspaceId: profile.workspaceId }, data: result });
  } catch (error) {
    // The details are saved either way; the next save or plan change tries again.
    log("error", "billing_profile_stripe_sync_failed", { workspaceId: profile.workspaceId, error: error instanceof Error ? error.message : String(error) });
    return profile;
  }
}

/** Webhook: Stripe finished (or redid) the VIES check of a tax ID. */
export async function applyTaxIdVerification(input: { stripeTaxIdId: string; verification: Stripe.TaxId["verification"] }): Promise<string> {
  const vatIdStatus = vatIdStatusFromStripe(input.verification);
  const { count } = await getPrisma().billingProfile.updateMany({
    where: { stripeTaxIdId: input.stripeTaxIdId },
    data: { vatIdStatus, vatIdVerifiedName: input.verification?.verified_name ?? null },
  });
  return count > 0 ? `vat_id_${vatIdStatus.toLowerCase()}` : "vat_id_unknown";
}
