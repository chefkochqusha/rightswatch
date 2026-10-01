import { requireSession } from "@/app/_lib/current-user";
import { canManageWorkspace } from "@/app/_lib/authorize";
import { getBillingStore } from "@/app/_lib/billing-store";
import { getCreatorStore } from "@/app/_lib/creator-store";
import { SubscriptionStatusBadge } from "@/components/billing/subscription-status-badge";
import { formatPlanPrice, SCAN_CADENCE_LABELS } from "@/components/billing/labels";
import { PLAN_CATALOG, TRIAL_LENGTH_DAYS, isMockCustomerId } from "@/modules/billing";
import { choosePlanAction, cancelSubscriptionAction, openBillingPortalAction } from "./actions";

export const metadata = {
  title: "Billing — RightsWatch",
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
          <span className="font-medium text-tx">Demo billing.</span> Plans, trials, switching and
          cancelling all work, but no payment is taken and no invoices exist. Real billing through
          Stripe turns on once it&apos;s connected.
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
                {currentPlan.name} · {formatPlanPrice(currentPlan.priceCents)}/mo
              </dd>
            </div>
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

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLAN_CATALOG.map((plan) => {
          const isCurrentPlan = !isCanceled && currentPlan?.id === plan.id;
          // Too small for what's monitored now (Brief §19) — pausing or
          // removing creators first makes room.
          const tooSmall = !isCurrentPlan && plan.creatorCap < trackedCreators;
          const buttonLabel = isCurrentPlan
            ? "Current plan"
            : subscription && !isCanceled
              ? "Switch to this plan"
              : "Start free trial";

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
                <form action={choosePlanAction} className="mt-5">
                  <input type="hidden" name="planTier" value={plan.tier} />
                  <button
                    type="submit"
                    disabled={isCurrentPlan}
                    className={
                      isCurrentPlan
                        ? "w-full rounded-full bg-hover px-4 py-2 text-sm font-medium text-t2"
                        : "w-full rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
                    }
                  >
                    {buttonLabel}
                  </button>
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
