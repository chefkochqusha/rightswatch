import { isScanDue } from "./schedule";

export interface DueScanSummary {
  workspaces: number;
  scanned: number;
  notDue: number;
  failed: number;
  /** Left for the next run because the time budget ran out; still due then. */
  deferred: number;
}

export interface DueScanDependencies {
  workspaceIds: readonly string[];
  /** The plan's scan cadence, or null when the workspace has no active plan. */
  cadenceFor: (workspaceId: string) => Promise<string | null>;
  /** When the last finished scan ended, or null if none did. The caller decides which runs count (the app counts completed and finally failed ones). */
  lastCompletedAt: (workspaceId: string) => Promise<Date | null>;
  /** Runs one workspace's scan. Returns false when there was nothing to scan. */
  scan: (workspaceId: string) => Promise<boolean>;
  now: Date;
  /** Epoch ms after which no new workspace is started. */
  deadline: number;
  clock?: () => number;
  onError?: (workspaceId: string, error: unknown) => void;
}

/**
 * Runs the scans that are due, one workspace at a time. One workspace
 * failing doesn't stop the others, and a workspace whose last scan failed
 * is tried again when `lastCompletedAt` says it is due.
 */
export async function runDueScansFor(deps: DueScanDependencies): Promise<DueScanSummary> {
  const clock = deps.clock ?? Date.now;
  const summary: DueScanSummary = { workspaces: deps.workspaceIds.length, scanned: 0, notDue: 0, failed: 0, deferred: 0 };

  for (const workspaceId of deps.workspaceIds) {
    const cadence = await deps.cadenceFor(workspaceId);
    if (!cadence || !isScanDue({ cadence, lastScanAt: await deps.lastCompletedAt(workspaceId), now: deps.now })) {
      summary.notDue += 1;
      continue;
    }
    if (clock() > deps.deadline) {
      summary.deferred += 1;
      continue;
    }
    try {
      if (await deps.scan(workspaceId)) summary.scanned += 1;
      else summary.notDue += 1;
    } catch (error) {
      summary.failed += 1;
      deps.onError?.(workspaceId, error);
    }
  }
  return summary;
}
