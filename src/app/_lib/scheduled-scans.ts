import { runDueScansFor, SCAN_JOB_TYPE, type DueScanSummary } from "@/modules/jobs";
import { getAuthStore } from "./auth-store";
import { getBillingStore } from "./billing-store";
import { getConnectorMode } from "./connector-mode";
import { DEMO_WORKSPACE_SLUG } from "./demo-access";
import { getJobStore } from "./job-store";
import { runWorkspaceScan } from "./workspace-scan-store";

export type ScheduledScanSummary = DueScanSummary & {
  /** Why nothing was looked at, when that is the case. */
  skipped?: "DEMO_CONNECTOR";
};

/**
 * The scheduled scan (Brief §35, §50): for every workspace whose plan says
 * a scan is due, run one, with nobody signed in as the actor. What "due"
 * means and how failures are handled is `modules/jobs/due-scans.ts`.
 *
 * - **Only with the real TikTok connector.** Every scan of the demo
 *   connector produces fictional posts, and a customer's workspace must not
 *   be topped up with invented posts and cases on a timer.
 * - The public demo workspace is never scanned again after it is filled.
 * - Workspaces run one at a time, and no new one starts after the time
 *   budget; the rest are still due on the next run.
 */
export async function runDueScans(now: Date = new Date(), budgetMs = 200_000): Promise<ScheduledScanSummary> {
  if (getConnectorMode() !== "REAL") return { workspaces: 0, scanned: 0, notDue: 0, failed: 0, deferred: 0, skipped: "DEMO_CONNECTOR" };

  const billing = getBillingStore();
  const jobs = getJobStore().jobs;
  const workspaces = (await getAuthStore().workspaces.findAll()).filter((w) => w.slug !== DEMO_WORKSPACE_SLUG);

  return runDueScansFor({
    workspaceIds: workspaces.map((w) => w.id),
    cadenceFor: async (workspaceId) => {
      const subscription = await billing.subscriptions.findByWorkspaceId(workspaceId);
      if (!subscription || subscription.status === "CANCELED") return null;
      return (await billing.plans.findById(subscription.planId))?.scanCadence ?? null;
    },
    lastCompletedAt: async (workspaceId) => {
      const recent = await jobs.findRecent(workspaceId, SCAN_JOB_TYPE, 5);
      return recent.find((job) => job.status === "COMPLETED")?.completedAt ?? null;
    },
    scan: async (workspaceId) => (await runWorkspaceScan(workspaceId, null)).ok,
    now,
    deadline: Date.now() + budgetMs,
    onError: (workspaceId, error) => console.error(`Scheduled scan failed for workspace ${workspaceId}:`, error),
  });
}
