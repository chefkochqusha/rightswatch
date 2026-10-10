import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe-client";
import { stripeTaxIdType, type BillingDetails } from "./billing-details";

/** The VAT ID statuses Bekvor shows (Prisma enum `VatIdStatus`). */
export type VatIdStatus = "NONE" | "FORMAT_OK" | "PENDING" | "VERIFIED" | "UNVERIFIED" | "UNAVAILABLE";

/** Stripe's verification status (it asks the EU's VIES register for `eu_vat`) → ours. */
export function vatIdStatusFromStripe(verification: Stripe.TaxId["verification"]): VatIdStatus {
  switch (verification?.status) {
    case "verified":
      return "VERIFIED";
    case "unverified":
      return "UNVERIFIED";
    case "unavailable":
      return "UNAVAILABLE";
    case "pending":
      return "PENDING";
    default:
      // No verification for this type (e.g. a Swiss or UK number Stripe stores but doesn't check).
      return "FORMAT_OK";
  }
}

export interface StripeBillingSyncResult {
  stripeTaxIdId: string | null;
  vatIdStatus: VatIdStatus;
  vatIdVerifiedName: string | null;
}

/**
 * Puts the company details on the Stripe customer, so invoices carry the
 * recipient's name and address, and its VAT ID (replacing the previous one
 * when it changed). Stripe then checks an EU VAT ID with VIES and reports the
 * result now (usually `pending`) and later by the `customer.tax_id.updated`
 * webhook.
 *
 * Not unit-tested, like the other thin Stripe adapters (see
 * `stripe-payment-provider.ts`); the mapping above is.
 */
export async function syncStripeBillingDetails(input: {
  customerId: string;
  details: BillingDetails;
  previous: { vatId: string | null; stripeTaxIdId: string | null };
}): Promise<StripeBillingSyncResult> {
  const stripe = getStripeClient();
  const { details } = input;
  await stripe.customers.update(input.customerId, {
    name: details.companyName,
    address: {
      line1: details.addressLine1,
      line2: details.addressLine2 ?? "",
      postal_code: details.postalCode,
      city: details.city,
      country: details.country,
    },
  });

  const type = details.vatId ? stripeTaxIdType(details.country) : null;
  const unchanged = input.previous.stripeTaxIdId && input.previous.vatId === details.vatId && type;
  if (unchanged) {
    const existing = await stripe.customers.retrieveTaxId(input.customerId, input.previous.stripeTaxIdId!);
    return { stripeTaxIdId: existing.id, vatIdStatus: vatIdStatusFromStripe(existing.verification), vatIdVerifiedName: existing.verification?.verified_name ?? null };
  }

  if (input.previous.stripeTaxIdId) {
    try {
      await stripe.customers.deleteTaxId(input.customerId, input.previous.stripeTaxIdId);
    } catch (error) {
      // Already gone (deleted in the dashboard): nothing to replace.
      if ((error as { code?: string }).code !== "resource_missing") throw error;
    }
  }
  if (!details.vatId) return { stripeTaxIdId: null, vatIdStatus: "NONE", vatIdVerifiedName: null };
  if (!type) return { stripeTaxIdId: null, vatIdStatus: "FORMAT_OK", vatIdVerifiedName: null };

  const taxId = await stripe.customers.createTaxId(input.customerId, { type, value: details.vatId });
  return { stripeTaxIdId: taxId.id, vatIdStatus: vatIdStatusFromStripe(taxId.verification), vatIdVerifiedName: taxId.verification?.verified_name ?? null };
}
