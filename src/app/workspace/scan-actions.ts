"use server";

import { revalidatePath } from "next/cache";
import { requireCaseManager } from "@/app/_lib/authorize";
import { runWorkspaceScan } from "@/app/_lib/workspace-scan-store";

/**
 * "Run scan" (Brief §50) for the caller's workspace — the ANALYST tier and
 * up: scans exist to feed cases, so whoever works cases can refresh the
 * data behind them; a VIEWER can look but not start one. Re-running is
 * safe: stored results update in place, and existing cases stay attached.
 */

export type ScanActionState =
  | { status: "idle" }
  | {
      status: "done";
      creators: number;
      videos: number;
      matches: number;
      newMatches: number;
      casesOpened: number;
      failedCreators: number;
      skippedOverLimit: number;
    }
  | { status: "error"; message: string };

export async function runScanAction(_prev: ScanActionState, _formData: FormData): Promise<ScanActionState> {
  const session = await requireCaseManager();
  const result = await runWorkspaceScan(session.workspace.id, session.user.id);
  // The whole layout: a scan can open cases, and each one adds to the
  // sidebar's unread-notification badge.
  revalidatePath("/workspace", "layout");

  if (!result.ok) {
    return {
      status: "error",
      message:
        result.error === "NO_PLAN"
          ? "Choose a plan to start monitoring. Every plan starts with a free trial."
          : "Add a creator to your watchlist first. A scan checks the creators you monitor.",
    };
  }
  const payload = result.job.payload;
  return {
    status: "done",
    creators: payload?.creatorsTotal ?? 0,
    videos: payload?.videosChecked ?? 0,
    matches: payload?.matches ?? 0,
    newMatches: payload?.newMatches ?? 0,
    casesOpened: payload?.casesOpened ?? 0,
    failedCreators: payload?.creators.filter((creator) => creator.error).length ?? 0,
    skippedOverLimit: payload?.skippedOverLimit ?? 0,
  };
}
