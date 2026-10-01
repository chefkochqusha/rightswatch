import Link from "next/link";
import { requireSession } from "@/app/_lib/current-user";
import { canManageCases } from "@/app/_lib/authorize";
import { getWorkspaceScanItems } from "@/app/_lib/workspace-scan-store";
import { getCaseStore } from "@/app/_lib/case-store";
import { getCreatorStore } from "@/app/_lib/creator-store";
import { getCreatorAllowance } from "@/app/_lib/creator-allowance";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonStyles } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import { STATUS_SORT_ORDER } from "@/components/rights/labels";
import { RunScanButton } from "@/components/scans/run-scan-button";

export const metadata = {
  title: "Overview — RightsWatch",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/**
 * The workspace's home: what scans found, most urgent first, and the way
 * to run one. A new workspace gets its first steps instead — a plan, a
 * creator to monitor, a first scan — in the order they're needed.
 */
export default async function WorkspacePage() {
  const session = await requireSession();
  const canManage = canManageCases(session.role);
  const workspaceId = session.workspace.id;

  const [items, creators, allowance, cases] = await Promise.all([
    getWorkspaceScanItems(workspaceId),
    getCreatorStore().creators.findForWorkspace(workspaceId),
    getCreatorAllowance(workspaceId),
    getCaseStore().cases.findForWorkspace(workspaceId),
  ]);
  const monitored = creators.filter((creator) => creator.monitoringEnabled);
  const caseByAssessment = new Map(cases.map((c) => [c.rightsAssessmentId, c]));

  const sorted = [...items].sort((a, b) => {
    const aRank = a.kind === "ASSESSED" ? STATUS_SORT_ORDER[a.assessment.status] : 99;
    const bRank = b.kind === "ASSESSED" ? STATUS_SORT_ORDER[b.assessment.status] : 99;
    if (aRank !== bRank) return aRank - bRank;
    return b.content.publishedAt.getTime() - a.content.publishedAt.getTime();
  });

  const steps = [
    { done: allowance.cap > 0, label: "Choose a plan", detail: "Every plan starts with a free 14-day trial.", href: "/workspace/billing" },
    { done: monitored.length > 0, label: "Add the creators to monitor", detail: "Their TikTok usernames are enough.", href: "/workspace/creators" },
    { done: items.length > 0, label: "Run your first scan", detail: "It checks their commercial posts for your music.", href: null },
  ];
  const nextStep = steps.findIndex((step) => !step.done);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description={
          monitored.length === 0
            ? `${session.workspace.name} isn't monitoring anyone yet.`
            : `What RightsWatch found across the ${monitored.length === 1 ? "creator" : `${monitored.length} creators`} ${session.workspace.name} monitors.`
        }
        actions={canManage && allowance.cap > 0 && monitored.length > 0 ? <RunScanButton creatorCount={Math.min(monitored.length, allowance.cap)} /> : undefined}
      />

      {nextStep !== -1 && (
        <section className="rounded-[1.125rem] border border-line bg-surface p-5 sm:p-6">
          <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">Get started</h2>
          <ol className="mt-4 space-y-3">
            {steps.map((step, index) => (
              <li key={step.label} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    step.done ? "bg-cleared-bg text-cleared" : index === nextStep ? "bg-accent text-white" : "bg-hover text-t2"
                  }`}
                >
                  {step.done ? <CheckIcon className="h-3 w-3" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${step.done ? "text-t2 line-through decoration-t2/40" : "text-tx"}`}>
                    {step.label}
                    {step.done && <span className="sr-only"> (done)</span>}
                  </p>
                  {!step.done && <p className="text-[0.8125rem] text-t2">{step.detail}</p>}
                </div>
                {index === nextStep && step.href && canManage && (
                  <Link href={step.href} className={buttonStyles("primary", "sm")}>
                    {step.label}
                  </Link>
                )}
              </li>
            ))}
          </ol>
          {!canManage && <p className="mt-4 text-[0.8125rem] text-t2">An owner, admin or analyst sets these up.</p>}
        </section>
      )}

      <section className="overflow-hidden rounded-[1.125rem] border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-3">
          <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">Detections</h2>
          {sorted.length > 0 && <p className="text-[0.8125rem] text-t2">Most urgent first</p>}
        </div>
        {sorted.length === 0 ? (
          <div className="border-t border-line">
            <EmptyState
              title="No music matches detected."
              description="Once a scan finds commercial posts by the creators you monitor, they show up here with what the rights check says about each one."
            />
          </div>
        ) : (
          <div className="relative overflow-x-auto border-t border-line">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead>
                <tr className="text-xs text-t2">
                  <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Creator</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Track</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Brand</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Published</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Case</th>
                  <th scope="col" className="px-5 py-2.5">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => {
                  const existingCase = item.rightsAssessmentId ? caseByAssessment.get(item.rightsAssessmentId) : undefined;
                  return (
                    <tr key={item.content.externalContentId} className="border-t border-line transition-colors hover:bg-hover">
                      <td className="px-5 py-3">
                        {item.kind === "ASSESSED" ? (
                          <StatusBadge status={item.assessment.status} />
                        ) : (
                          <span className="text-[0.8125rem] text-t2">
                            {item.kind === "NO_MUSIC_MATCH" ? "No track identified" : "Identification didn't complete"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link href={`/workspace/creators/${item.creatorId}`} className="text-tx hover:text-accent">
                          @{item.creatorUsername}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {item.kind === "ASSESSED" ? (
                          <>
                            <span className="block text-tx">{item.musicMatch.title}</span>
                            <span className="block text-[0.8125rem] text-t2">{item.musicMatch.artist}</span>
                          </>
                        ) : (
                          <span className="text-t2">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-t2">{item.content.brandNames.join(", ") || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-t2">{dateFormatter.format(item.content.publishedAt)}</td>
                      <td className="px-4 py-3">
                        {existingCase ? <CaseStatusBadge status={existingCase.status} /> : <span className="text-t2">—</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/workspace/items/${encodeURIComponent(item.content.externalContentId)}`}
                          className="text-[0.8125rem] font-medium text-accent hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
