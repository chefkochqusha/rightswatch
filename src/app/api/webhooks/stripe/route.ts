import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe-client";
import { getBillingStore } from "@/app/_lib/billing-store";
import { getWebhookStore } from "@/app/_lib/webhook-store";
import { handleStripeWebhook, isStripeConfigured, planTierForPriceId } from "@/modules/billing";

/**
 * Stripe's webhook endpoint: https://<host>/api/webhooks/stripe. HTTP
 * plumbing only — verification, idempotency and the subscription sync all
 * live in `modules/billing/handle-stripe-webhook.ts`, where they're tested.
 *
 * Public on purpose: `proxy.ts`'s matcher already excludes `/api/*`, and
 * the Stripe signature, not a session, is what authenticates the caller.
 *
 * 503 until every Stripe variable is set (the same all-or-nothing check
 * that picks the payment provider). An endpoint registered in the dashboard
 * before the keys land in Vercel misses nothing that matters: until then
 * the app is on demo billing, so no RightsWatch subscription exists on
 * Stripe's side to produce events. Setup steps: STRIPE_INTEGRATION.md.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isStripeConfigured(process.env)) {
    return new Response("Stripe is not configured on this deployment.", { status: 503 });
  }

  const store = getBillingStore();
  const result = await handleStripeWebhook(
    // `.text()`, never `.json()`: the signature covers the exact bytes sent.
    { rawBody: await request.text(), signatureHeader: request.headers.get("stripe-signature") },
    {
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      constructEvent: (body, header, secret) => Stripe.webhooks.constructEvent(body, header, secret),
      webhookEventRepository: getWebhookStore().events,
      subscriptionRepository: store.subscriptions,
      planRepository: store.plans,
      planTierForPriceId: (priceId) => planTierForPriceId(priceId, process.env),
      // Current state, not the event's copy — Stripe doesn't guarantee
      // delivery order (see the dependency's doc comment).
      retrieveSubscription: (id) => getStripeClient().subscriptions.retrieve(id),
    },
  );

  console.log(JSON.stringify({ source: "stripe_webhook", status: result.status, ...result.log }));
  return new Response(result.body, { status: result.status });
}
