import { getStripeClient } from "@/lib/stripe-client";

/**
 * Stripe's hosted Customer Portal (Master Brief §18 "customer portal", §20
 * "Manage billing" and "Invoices"): payment method, invoice history and
 * receipts, cancellation — everything Stripe already does well and this app
 * has no business re-implementing. Whatever the customer changes there
 * comes back through the webhook (`handle-stripe-webhook.ts`).
 *
 * Needs the portal's settings saved once in the Stripe dashboard before the
 * first session can be created (a test-mode requirement, see
 * STRIPE_INTEGRATION.md). Thin adapter, no test file — same reasoning as
 * `stripe-payment-provider.ts`.
 */
export async function createStripeBillingPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const session = await getStripeClient().billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  });
  return { url: session.url };
}
