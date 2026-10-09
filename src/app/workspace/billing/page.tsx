import { requireSession } from "@/app/_lib/current-user";
import { canManageWorkspace } from "@/app/_lib/authorize";
import { getBillingStore } from "@/app/_lib/billing-store";
import { getCreatorStore } from "@/app/_lib/creator-store";
import { DEMO_WORKSPACE_SLUG } from "@/app/_lib/demo-constants";
import { SubscriptionStatusBadge } from "@/components/billing/subscription-status-badge";
import { formatPlanPrice, SCAN_CADENCE_LABELS } from "@/components/billing/labels";
import { LOYALTY, PLAN_CATALOG, TRIAL_LENGTH_DAYS, annualPriceCents, isMockCustomerId, loyaltyStatus, monthOfMaxDiscount, monthlyPriceCents } from "@/modules/billing";
import { choosePlanAction, cancelSubscriptionAction, openBillingPortalAction } from "./actions";

export const metadata = {
  title: "Billing — Bekvor",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

/**
 * The real workspace's plan/subscription page (Master Brief §18–20). The
 * subscribe / switch-plan / cancel / resubscribe lifecycle underneath it is
 * real either way; which payment backend it runs on is decided by the
 * environment (`app/_lib/billing-store.ts`), and the page always says which
 * one that is — demo billing is labeled as demo billing, never passed off
 * as real payments (Master Brief §76).
 */
export default async function BillingPage() {
  const session = await requireSession();
  const canManage = canManageWorkspace(session.role);
  const store = getBillingStore();
  const subscription = await store.subscriptions.findByWorkspaceId(session.workspace.id);
  const currentPlan = subscription ? await store.plans.findById(subscription.planId) : null;
  const isCanceled = subscription?.status === "CANCELED";
  const isStripeMode = store.mode === "stripe";
  // A real Stripe customer is what the Customer Portal needs. A workspace
  // that subscribed under demo billing keeps its mock ids (see
  // `RoutingPaymentProvider`) and has nothing on Stripe's side to manage.
  const hasStripeCustomer = Boolean(subscription && !isMockCustomerId(subscription.stripeCustomerId));

  // Brief §20's usage figure: creators monitored right now — what a plan's
  // limit counts (§19), so paused and removed creators don't.
  const trackedCreators = await getCreatorStore().creators.countMonitored(session.workspace.id);
  const loyalty = subscription && !isCanceled ? loyaltyStatus(subscription, new Date()) : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
      <p className="mt-1 text-sm text-t2">
        {subscription && !isCanceled
          ? "Manage your plan and subscription."
          : `Choose a plan to start monitoring creators in your workspace. Every plan starts with a ${TRIAL_LENGTH_DAYS}-day free trial, no card needed.`}
      </p>

      {!isStripeMode && (
        <p className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-3 text-[0.8125rem] text-t2">
          <span className="font-medium text-tx">Demo billing.</span>{" "}
          {session.workspace.slug === DEMO_WORKSPACE_SLUG
            ? "This is how plans look in a workspace. In the public demo you can look but not change anything."
            : "Plans, trials, switching and cancelling all work, but no payment is taken and no invoices exist. Real billing through Stripe turns on once it\u2019s connected."}
        </p>
      )}

      {subscription && currentPlan && (
        <section className="mt-6 rounded-lg border border-line bg-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">
              {isCanceled ? "Previous subscription" : "Current subscription"}
            </h2>
            <SubscriptionStatusBadge status={subscription.status} />
          </div>
          <dl className="mt-3 space-y-2.5 text-[0.8125rem]">
            <div className="flex justify-between gap-3">
              <dt className="text-t2">Plan</dt>
              <dd className="text-tx">
                {currentPlan.name} · {subscription.billingInterval === "ANNUAL" ? "billed yearly" : "billed monthly"}
              </dd>
            </div>
            {loyalty && (
              <div className="flex justify-between gap-3">
                <dt className="text-t2">Your price</dt>
                <dd className="text-right text-tx">
                  {formatPlanPrice(
                    subscription.billingInterval === "ANNUAL"
                      ? annualPriceCents(currentPlan)
                      : subscription.status === "TRIALING"
                        ? currentPlan.priceCents
                        : monthlyPriceCents(currentPlan, "MONTHLY", loyalty.month),
                  )}
                  {subscription.billingInterval === "ANNUAL" ? " a year" : " a month"}
                  {loyalty.percent > 0 && subscription.status !== "TRIALING" && (
                    <span className="ml-1.5 rounded-full bg-cleared-bg px-2 py-0.5 text-xs font-medium text-cleared">−{loyalty.percent} %</span>
                  )}
                </dd>
              </div>
            )}
            {loyalty && subscription.billingInterval === "MONTHLY" && (
              <div className="flex justify-between gap-3">
                <dt className="text-t2">Loyalty discount</dt>
                <dd className="text-right text-tx">
                  {subscription.status === "TRIALING"
                    ? `Starts after the trial: −${LOYALTY.firstStepPercent} % from month ${LOYALTY.firstStepMonth}`
                    : loyalty.next
                      ? `−${loyalty.next.percent} % from ${dateFormatter.format(loyalty.next.from)}`
                      : `Maximum reached (−${LOYALTY.maxPercent} %)`}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-t2">Tracked creators</dt>
              <dd className="text-tx">
                {trackedCreators} of {currentPlan.creatorCap}
              </dd>
            </div>
            {subscription.currentPeriodEnd && !isCanceled && (
              <div className="flex justify-between gap-3">
                <dt className="text-t2">
                  {subscription.status === "TRIALING" ? "Trial ends" : "Renews"}
                </dt>
                <dd className="text-tx">{dateFormatter.format(subscription.currentPeriodEnd)}</dd>
              </div>
            )}
          </dl>
          {isStripeMode && hasStripeCustomer && subscription.status === "TRIALING" && (
            <p className="mt-3 text-[0.8125rem] text-t2">
              Add a payment method under Manage billing before the trial ends to keep monitoring.
              Without one, the subscription simply ends. You won&apos;t be charged.
            </p>
          )}
          {isStripeMode && !hasStripeCustomer && !isCanceled && (
            <p className="mt-3 text-[0.8125rem] text-t2">
              This subscription was started under demo billing and isn&apos;t connected to Stripe.
              Cancel it and start a new trial to move to real billing.
            </p>
          )}
          {!isCanceled && canManage && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              {isStripeMode && hasStripeCustomer && (
                <form action={openBillingPortalAction}>
                  <button
                    type="submit"
                    className="rounded-full border border-line px-3 py-1.5 text-[0.8125rem] font-medium text-t2 hover:bg-hover hover:text-tx"
                  >
                    Manage billing &amp; invoices
                  </button>
                </form>
              )}
              <form action={cancelSubscriptionAction}>
                <button
                  type="submit"
                  className="text-[0.8125rem] font-medium text-mismatch hover:underline"
                >
                  Cancel subscription
                </button>
              </form>
            </div>
          )}
          {!isCanceled && !canManage && (
            <p className="mt-4 text-[0.8125rem] text-t2">
              Only owners and admins can change or cancel the plan.
            </p>
          )}
        </section>
      )}

      <p className="mt-6 max-w-3xl text-[0.8125rem] leading-normal text-t2">
        Prices are net of tax. The trial lasts {TRIAL_LENGTH_DAYS} days and needs no card. Monthly billing renews every month until you cancel and gets
        cheaper the longer you stay: −{LOYALTY.firstStepPercent} % from month {LOYALTY.firstStepMonth}, then {LOYALTY.stepPercent} % more each month, up
        to −{LOYALTY.maxPercent} % from month {monthOfMaxDiscount()}. Cancelling and subscribing again starts at the full price. Yearly billing is −
        {LOYALTY.annualPercent} % from the start, paid for twelve months ahead, and renews every year until you cancel. You can cancel here at any time.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLAN_CATALOG.map((plan) => {
          const isCurrentPlan = !isCanceled && currentPlan?.id === plan.id;
          const currentInterval = isCurrentPlan ? subscription?.billingInterval : null;
          // Too small for what's monitored now (Brief §19) — pausing or
          // removing creators first makes room.
          const tooSmall = !isCurrentPlan && plan.creatorCap < trackedCreators;
          const startLabel = subscription && !isCanceled ? "Switch" : "Start free trial";

          return (
            <section
              key={plan.id}
              className={`rounded-lg border bg-surface p-5 ${
                isCurrentPlan ? "border-tx ring-1 ring-tx" : "border-line"
              }`}
            >
              <h2 className="text-sm font-semibold">{plan.name}</h2>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {formatPlanPrice(plan.priceCents)}
                <span className="text-sm font-normal text-t2"> /mo</span>
              </p>
              <p className="mt-1 text-[0.8125rem] text-t2">
                Down to {formatPlanPrice(monthlyPriceCents(plan, "MONTHLY", monthOfMaxDiscount()))}/mo by month {monthOfMaxDiscount()}, or{" "}
                {formatPlanPrice(annualPriceCents(plan))} a year (−{LOYALTY.annualPercent} %).
              </p>
              <dl className="mt-4 space-y-2 text-[0.8125rem]">
                <div className="flex justify-between gap-3">
                  <dt className="text-t2">Creators</dt>
                  <dd className="text-tx">Up to {plan.creatorCap}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-t2">Scan cadence</dt>
                  <dd className="text-tx">
                    {SCAN_CADENCE_LABELS[plan.scanCadence] ?? plan.scanCadence}
                  </dd>
                </div>
              </dl>
              {canManage && tooSmall ? (
                <p className="mt-5 text-[0.8125rem] text-t2">
                  You monitor {trackedCreators} creators. Pause or remove some to switch to {plan.name}.
                </p>
              ) : canManage ? (
                <form action={choosePlanAction} className="mt-5 grid gap-2">
                  <input type="hidden" name="planTier" value={plan.tier} />
                  {(["MONTHLY", "ANNUAL"] as const).map((interval) => {
                    const current = currentInterval === interval;
                    return (
                      <button
                        key={interval}
                        type="submit"
                        name="billingInterval"
                        value={interval}
                        disabled={current}
                        className={
                          current
                            ? "w-full rounded-full bg-hover px-4 py-2 text-sm font-medium text-t2"
                            : interval === "MONTHLY"
                              ? "w-full rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
                              : "w-full rounded-full border border-line px-4 py-2 text-sm font-medium text-tx hover:bg-hover"
                        }
                      >
                        {current ? "Current plan" : `${startLabel}${interval === "MONTHLY" ? ", monthly" : ", yearly −" + LOYALTY.annualPercent + " %"}`}
                      </button>
                    );
                  })}
                </form>
              ) : (
                <button
                  type="button"
                  disabled
                  className="mt-5 w-full rounded-full bg-hover px-4 py-2 text-sm font-medium text-t2"
                >
                  {isCurrentPlan ? "Current plan" : "Ask an owner or admin"}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
