import Link from "next/link";
import { requireSession } from "@/app/_lib/current-user";
import { canManageCases } from "@/app/_lib/authorize";
import { getWorkspaceScanItems } from "@/app/_lib/workspace-scan-store";
import { getCaseStore } from "@/app/_lib/case-store";
import { getBillingStore } from "@/app/_lib/billing-store";
import { WorkspaceHeader } from "@/components/layout/workspace-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import { SubscriptionStatusBadge } from "@/components/billing/subscription-status-badge";
import { formatPlanPrice } from "@/components/billing/labels";
import { STATUS_SORT_ORDER } from "@/components/rights/labels";
import { runSampleScanAction } from "./scan-actions";

export const metadata = {
  title: "Your workspace — RightsWatch",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/**
 * The real, authenticated home — as opposed to `/dashboard`, `/creators`
 * and `/assessments/*`, which are Demo Mode: public, fixture-data pages
 * that exist so a prospect can see the product with no signup at all
 * (Phase 6). Connecting a real TikTok account is Phase 10, still gated on
 * TikTok's reply, so a freshly signed-up workspace has nothing of its own
 * to show yet. Rather than leave it empty, "Run a sample scan" populates
 * *this* workspace with the same fixture pipeline Demo Mode uses — see
 * `workspace-scan-store.ts` — so a real, logged-in user has something
 * genuine to open cases against before Phase 10 lands.
 */
export default async function WorkspacePage() {
  const session = await requireSession();
  const canManage = canManageCases(session.role);
  const items = await getWorkspaceScanItems(session.workspace.id);

  const sorted = [...items].sort((a, b) => {
    const aRank = a.kind === "ASSESSED" ? STATUS_SORT_ORDER[a.assessment.status] : -1;
    const bRank = b.kind === "ASSESSED" ? STATUS_SORT_ORDER[b.assessment.status] : -1;
    if (aRank !== bRank) return aRank - bRank;
    return b.content.publishedAt.getTime() - a.content.publishedAt.getTime();
  });

  const caseStore = getCaseStore();
  const rows = await Promise.all(
    sorted.map(async (item) => ({
      item,
      // Only an assessed item has an assessment for a case to belong to.
      existingCase: item.rightsAssessmentId
        ? await caseStore.cases.findByRightsAssessmentId(item.rightsAssessmentId)
        : null,
    })),
  );

  const billingStore = getBillingStore();
  const subscription = await billingStore.subscriptions.findByWorkspaceId(session.workspace.id);
  const currentPlan =
    subscription && subscription.status !== "CANCELED"
      ? await billingStore.plans.findById(subscription.planId)
      : null;

  return (
    <div className="flex min-h-screen flex-col">
      <WorkspaceHeader />

      <main className="mx-auto w-full max-w-(--content-width) flex-1 px-6 py-8 [--content-width:1100px]">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome, {session.user.name ?? session.user.email}
        </h1>
        <p className="mt-1 text-sm text-t2">
          Signed in as {session.user.email} · {session.role.toLowerCase()} on{" "}
          {session.workspace.name}
        </p>

        <section className="mt-8 rounded-lg border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Your workspace</h2>
          <dl className="mt-3 space-y-2.5 text-[0.8125rem]">
            <div className="flex justify-between gap-3">
              <dt className="text-t2">Name</dt>
              <dd className="text-tx">{session.workspace.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-t2">Slug</dt>
              <dd className="text-tx">{session.workspace.slug}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-t2">Your role</dt>
              <dd className="text-tx">{session.role}</dd>
            </div>
          </dl>
          <p className="mt-4 text-[0.8125rem] text-t2">
            Connecting TikTok is Phase 10, still gated on API access. In the meantime, see{" "}
            <Link href="/dashboard" className="text-accent hover:underline">
              Demo Mode
            </Link>{" "}
            for a full walkthrough using example data, or run a sample scan below to try case
            management in your own workspace.
          </p>
        </section>

        <section className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-line bg-surface p-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-semibold">Subscription</h2>
              {subscription && <SubscriptionStatusBadge status={subscription.status} />}
            </div>
            <p className="mt-1 text-[0.8125rem] text-t2">
              {currentPlan
                ? `${currentPlan.name} · ${formatPlanPrice(currentPlan.priceCents)}/mo · up to ${currentPlan.creatorCap} creators`
                : "No active plan yet — choose one to unlock a higher creator limit."}
            </p>
          </div>
          <Link
            href="/workspace/billing"
            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[0.8125rem] font-medium text-t2 hover:bg-hover hover:text-tx"
          >
            {currentPlan ? "Manage billing" : "Choose a plan"}
          </Link>
        </section>

        <div className="mt-6">
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center">
              <h2 className="text-sm font-semibold">No scans yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-t2">
                Run a sample scan against example creators to see how RightsWatch assesses
                content and manages cases, right here in your own workspace.
              </p>
              {canManage ? (
                <form action={runSampleScanAction} className="mt-5">
                  <button
                    type="submit"
                    className="rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
                  >
                    Run a sample scan
                  </button>
                </form>
              ) : (
                <p className="mt-5 text-[0.8125rem] text-t2">
                  Ask an owner, admin, or analyst to run the first scan.
                </p>
              )}
            </div>
          ) : (
            <section className="overflow-hidden rounded-lg border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold">Sample scan results</h2>
                  <p className="mt-0.5 text-[0.8125rem] text-t2">
                    From example creators — so you can try case management before Phase 10
                    connects a real TikTok account.
                  </p>
                </div>
                {canManage && (
                  <form action={runSampleScanAction}>
                    <button
                      type="submit"
                      className="rounded-full border border-line px-3 py-1.5 text-[0.8125rem] font-medium text-t2 hover:bg-hover hover:text-tx"
                    >
                      Re-run sample scan
                    </button>
                  </form>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-[0.8125rem] text-t2">
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Creator</th>
                      <th className="px-5 py-3 font-medium">Brand</th>
                      <th className="px-5 py-3 font-medium">Track</th>
                      <th className="px-5 py-3 font-medium">Published</th>
                      <th className="px-5 py-3 font-medium">Case</th>
                      <th className="px-5 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ item, existingCase }) => (
                      <tr
                        key={item.content.externalContentId}
                        className="border-b border-line last:border-0"
                      >
                        <td className="px-5 py-3.5 align-top">
                          {item.kind === "ASSESSED" ? (
                            <StatusBadge status={item.assessment.status} />
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-hover px-2.5 py-1 text-xs font-medium whitespace-nowrap text-t2">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                              {item.kind === "NO_MUSIC_MATCH"
                                ? "No track identified"
                                : "Identification failed"}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 align-top whitespace-nowrap text-tx">
                          @{item.creatorUsername}
                        </td>
                        <td className="px-5 py-3.5 align-top text-t2">
                          {item.content.brandNames.join(", ") || "—"}
                        </td>
                        <td className="px-5 py-3.5 align-top">
                          {item.kind === "ASSESSED" ? (
                            <div>
                              <div className="text-tx">{item.musicMatch.title}</div>
                              <div className="text-[0.8125rem] text-t2">
                                {item.musicMatch.artist}
                              </div>
                            </div>
                          ) : (
                            <span className="text-t2">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 align-top whitespace-nowrap text-t2">
                          {dateFormatter.format(item.content.publishedAt)}
                        </td>
                        <td className="px-5 py-3.5 align-top">
                          {existingCase ? (
                            <CaseStatusBadge status={existingCase.status} />
                          ) : (
                            <span className="text-[0.8125rem] text-t2">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 align-top whitespace-nowrap">
                          <Link
                            href={`/workspace/items/${encodeURIComponent(item.content.externalContentId)}`}
                            className="text-[0.8125rem] font-medium text-accent hover:underline"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
