import { PermanentJobError, SCAN_JOB_TYPE, emptyScanPayload, type JobRecord, type ScanJobPayload } from "@/modules/jobs";
import { getAuthStore } from "./auth-store";
import { dataModeFor } from "./connector-mode";
import { getCreatorAllowance } from "./creator-allowance";
import { getCreatorStore } from "./creator-store";
import { getJobRunnerMode } from "./job-runner";
import { getJobStore } from "./job-store";
import { runWorkspaceScan, type RunWorkspaceScanResult } from "./workspace-scan-store";

/**
 * Starting a scan, wherever it runs (`job-runner.ts`).
 *
 * Inline, the scan runs now and the caller gets its result. With the
 * worker, the scan is queued and the caller gets the job; a second request
 * while one is waiting or running gets that same job instead of a second
 * scan.
 */

export type StartScanResult =
  | { kind: "done"; result: RunWorkspaceScanResult }
  | { kind: "queued"; job: JobRecord<ScanJobPayload>; alreadyQueued: boolean }
  | { kind: "refused"; error: "NO_PLAN" | "NO_CREATORS" };

export async function startWorkspaceScan(workspaceId: string, triggeredByUserId: string | null): Promise<StartScanResult> {
  if (getJobRunnerMode() === "inline") {
    const result = await runWorkspaceScan(workspaceId, triggeredByUserId);
    return result.ok ? { kind: "done", result } : { kind: "refused", error: result.error };
  }
  return queueWorkspaceScan(workspaceId, triggeredByUserId);
}

export async function queueWorkspaceScan(workspaceId: string, triggeredByUserId: string | null): Promise<StartScanResult> {
  const refusal = await scanRefusal(workspaceId);
  if (refusal) return { kind: "refused", error: refusal };

  const queue = getJobStore().queue;
  const pending = await queue.findPending<ScanJobPayload>(workspaceId, SCAN_JOB_TYPE);
  if (pending) return { kind: "queued", job: pending, alreadyQueued: true };

  const workspace = await getAuthStore().workspaces.findById(workspaceId);
  if (!workspace) throw new Error("Workspace not found.");
  const job = await queue.enqueue<ScanJobPayload>({
    workspaceId,
    type: SCAN_JOB_TYPE,
    payload: emptyScanPayload({ triggeredByUserId, connectorMode: dataModeFor(workspace), creatorsTotal: 0, skippedOverLimit: 0 }),
  });
  return { kind: "queued", job, alreadyQueued: false };
}

/** The worker's handler for a queued scan. */
export async function runQueuedScan(job: JobRecord): Promise<ScanJobPayload | null> {
  if (!job.workspaceId) throw new PermanentJobError("A scan job needs a workspace.");
  const triggeredBy = (job.payload as ScanJobPayload | null)?.triggeredByUserId ?? null;
  const result = await runWorkspaceScan(job.workspaceId, triggeredBy, { queuedJobId: job.id });
  if (!result.ok) {
    throw new PermanentJobError(
      result.error === "NO_PLAN" ? "The workspace has no active plan." : "The workspace monitors no creators.",
    );
  }
  return result.job.payload;
}

/** The same checks `runWorkspaceScan` makes first, so a request is
 *  refused at once instead of queuing a job that can only fail. */
async function scanRefusal(workspaceId: string): Promise<"NO_PLAN" | "NO_CREATORS" | null> {
  const allowance = await getCreatorAllowance(workspaceId);
  if (allowance.cap <= 0) return "NO_PLAN";
  const monitored = (await getCreatorStore().creators.findForWorkspace(workspaceId)).filter((c) => c.monitoringEnabled);
  return monitored.length === 0 ? "NO_CREATORS" : null;
}
