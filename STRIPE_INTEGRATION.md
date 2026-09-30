# Stripe integration (test mode)

How RightsWatch bills through Stripe, how to switch it on, and how to check
that it works. Master Brief §18–20 (billing), §22 (webhook idempotency).

## What it does

RightsWatch has two payment backends behind one interface
(`PaymentProvider`, `src/modules/billing/types.ts`):

- **Demo billing** (`MockPaymentProvider`) — plans, trials, switching and
  cancelling all work, but no money moves and no invoices exist. The billing
  page labels it as demo billing.
- **Stripe** (`StripePaymentProvider`) — real Stripe objects, in test mode.

Which one runs is decided by the environment, never by code: **all five**
Stripe variables set → Stripe; anything missing → demo billing
(`payment-provider-selection.ts`). All-or-nothing on purpose — a secret key
without a webhook secret would let subscriptions start but never hear about
anything Stripe changes afterwards, which is worse than not starting at all.

The lifecycle on Stripe:

1. **Choose a plan** → a Stripe customer and a subscription with a
   14-day trial. No card is asked for.
2. **Manage billing & invoices** on `/workspace/billing` (OWNER/ADMIN) opens
   Stripe's hosted Customer Portal: add a card, see invoices, cancel.
3. **Trial ends** → with a card on file the subscription becomes active and
   is charged; without one it simply ends (`trial_settings.end_behavior:
   cancel`) — no failed-payment emails for a card nobody gave.
4. **Anything Stripe changes on its own** (trial ending, payment failing,
   a cancel in the portal) reaches RightsWatch through the webhook, which
   updates the workspace's `Subscription` row.

Workspaces that subscribed under demo billing keep that demo subscription
(plan switches included) until they cancel; their next subscribe creates a
real Stripe customer and trial. The billing page tells them so.

## Setup — once, about 15 minutes

Do all of this in a **sandbox** (Stripe's test environment; keys start with
`sk_test_`). Nothing here touches real money.

### 1. Products and prices

Product catalog → create three products, each with one **recurring, monthly
price in EUR** matching `src/modules/billing/plan-catalog.ts`:

| Product | Price |
|---|---|
| Starter | €99 / month |
| Growth | €299 / month |
| Agency | €999 / month |

Copy each price's id (`price_…`) — step 4 needs them.

### 2. Customer portal

Settings → Billing → Customer portal
(`https://dashboard.stripe.com/settings/billing/portal`, while in the sandbox):

- **On:** update payment methods, invoice history, cancel subscriptions.
- **Off:** switching plans. RightsWatch's own billing page does that, and
  a plan switch made in the portal during a trial ends the trial on the
  spot (Stripe's behavior) — a surprise charge the app's own switch never
  causes. The webhook does follow a portal switch correctly if you ever
  turn it on.
- **Save.** Stripe refuses to create portal sessions in a sandbox until the
  settings have been saved there once.

### 3. Webhook destination

Workbench → Webhooks (`https://dashboard.stripe.com/webhooks`) →
**Create new destination**:

- API version: the default (latest). RightsWatch re-reads each subscription
  from the API rather than trusting the event's copy, so the version
  chosen here doesn't matter.
- **Events on your account**, with these event types:
  `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `customer.subscription.paused`,
  `customer.subscription.resumed`
  (the list lives in `HANDLED_STRIPE_EVENT_TYPES`,
  `handle-stripe-webhook.ts`).
- Destination type **Webhook**, endpoint URL
  `https://rightswatch-lennnny.vercel.app/api/webhooks/stripe`.
- Create it, then reveal and copy its **signing secret** (`whsec_…`).

### 4. Vercel environment variables

Vercel → the `rightswatch` project → Settings → Environment Variables,
for **Production** (and Preview, if previews should bill through Stripe too):

| Name | Value |
|---|---|
| `STRIPE_SECRET_KEY` | the sandbox secret key, `sk_test_…` |
| `STRIPE_WEBHOOK_SECRET` | the destination's signing secret, `whsec_…` |
| `STRIPE_PRICE_ID_STARTER` | `price_…` for Starter |
| `STRIPE_PRICE_ID_GROWTH` | `price_…` for Growth |
| `STRIPE_PRICE_ID_AGENCY` | `price_…` for Agency |

Enter them in Vercel directly. They never go into the repository, `.env`
files that get committed, or a chat.

### 5. Redeploy

Vercel only applies changed variables to a new deployment: Deployments →
latest → Redeploy. From that deployment on, billing runs on Stripe.

## Checking that it works

1. `/workspace/billing` no longer shows the "Demo billing" notice.
2. Choose a plan. In Stripe: a new customer (metadata `workspaceId`) with a
   trialing subscription on the matching price.
3. **Manage billing & invoices** opens the portal; add the test card
   `4242 4242 4242 4242` (any future date, any CVC).
4. End the trial early from the subscription's page in the Stripe
   dashboard. Within seconds `/workspace/billing` shows **Active**. Without
   a card, the same step ends the subscription and the page shows
   **Canceled**.
5. Workbench → Webhooks → the destination → **Event deliveries**: every
   delivery answered `200`.
6. Vercel → Logs: one line per delivery, `"source":"stripe_webhook"`, with
   the event id, type and outcome — never customer data.

## When something goes wrong

| Situation | What happens |
|---|---|
| Any of the five variables missing | Demo billing stays on; the webhook answers `503` |
| Bad or missing signature | `400`; nothing is recorded or changed |
| Database or Stripe API briefly unavailable | `500`; Stripe retries (for days in live mode, a few times over a few hours in a sandbox — redeliver by hand from Event deliveries after that). The delivery stays unprocessed, so the retry is handled normally |
| Same event delivered twice | Recorded once in `WebhookEvent`, processed once (Brief §22) |
| Events arriving out of order | Harmless: each one syncs from the subscription's current state in Stripe, never from the event's own, possibly older, copy |
| Event about a subscription RightsWatch didn't create | Recorded and acknowledged; no workspace changes |
| Subscription deleted from Stripe entirely (e.g. "Delete all test data") | Falls back to the event's own copy instead of failing for days |

## Code map

| File | Role |
|---|---|
| `src/modules/billing/payment-provider-selection.ts` | Picks the backend from the environment; routes demo-era ids to the mock |
| `src/modules/billing/stripe-payment-provider.ts` | Customers, subscriptions (with trial), plan changes, cancels |
| `src/modules/billing/stripe-billing-portal.ts` | Customer Portal sessions |
| `src/modules/billing/handle-stripe-webhook.ts` | Signature check, idempotency, sync — the whole webhook minus HTTP |
| `src/modules/billing/stripe-subscription-sync.ts` | Maps Stripe status/price/period onto the `Subscription` row |
| `src/modules/webhooks/` | `WebhookEvent` repository (idempotency record, minimal payload) |
| `src/app/api/webhooks/stripe/route.ts` | The HTTP endpoint |
| `src/lib/stripe-client.ts` | Lazily-built, process-cached Stripe client |

Everything with logic in it is unit-tested without a network, including
real HMAC signing and verification through the Stripe SDK
(`handle-stripe-webhook.test.ts`).

## Going live (not yet)

Live mode is a separate world in Stripe: live products and prices, a live
portal configuration, a live webhook destination, live keys (`sk_live_…`).
None of it is set up, and it shouldn't be until the business side (legal
entity, invoicing details, tax) is settled.
