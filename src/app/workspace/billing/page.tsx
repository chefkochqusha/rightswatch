import Link from "next/link";
import { requireSession } from "@/app/_lib/current-user";
import { canManageWorkspace } from "@/app/_lib/authorize";
import { getBillingStore } from "@/app/_lib/billing-store";
import { getWorkspaceScanItems } from "@/app/_lib/workspace-scan-store";
import { WorkspaceHeader } from "@/components/layout/workspace-header";
import { SubscriptionStatusBadge } from "@/components/billing/subscription-status-badge";
import { formatPlanPrice, SCAN_CADENCE_LABELS } from "@/components/billing/labels";
import { PLAN_CATALOG } from "@/modules/billing";
import { choosePlanAction, cancelSubscriptionAction } from "./actions";

export const metadata = {
  title: "Billing — RightsWatch",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

/**
 * The real workspace's plan/subscription page (Master Brief §18–20). Runs
 * entirely against `MockPaymentProvider` — see `modules/billing/types.ts`
 * for why a real Stripe integration isn't wired up yet — but the
 * subscribe / switch-plan / cancel / resubscribe lifecycle underneath it
 * is real, not a static pricing table.
 */
export default async function BillingPage() {
  const session = await requireSession();
  const canManage = canManageWorkspace(session.role);
  const store = getBillingStore();
  const subscription = await store.subscriptions.findByWorkspaceId(session.workspace.id);
  const currentPlan = subscription ? await store.plans.findById(subscription.planId) : null;
  const isCanceled = subscription?.status === "CANCELED";

  const trackedCreators = new Set(
    getWorkspaceScanItems(session.workspace.id).map((item) => item.creatorExternalId),
  ).size;

  return (
    <div className="flex min-h-screen flex-col">
      <WorkspaceHeader />

      <main className="mx-auto w-full max-w-(--content-width) flex-1 px-6 py-8 [--content-width:1100px]">
        <Link href="/workspace" className="text-[0.8125rem] text-t2 hover:text-tx">
          ← Back to workspace
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-t2">
          {subscription && !isCanceled
            ? "Manage your plan and subscription."
            : "Choose a plan to start monitoring creators in your workspace."}
        </p>

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
            {!isCanceled && canManage && (
              <form action={cancelSubscriptionAction} className="mt-4">
                <button
                  type="submit"
                  className="text-[0.8125rem] font-medium text-mismatch hover:underline"
                >
                  Cancel subscription
                </button>
              </form>
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
                {canManage ? (
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
      </main>
    </div>
  );
}
