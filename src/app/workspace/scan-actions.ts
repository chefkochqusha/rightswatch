"use server";

import { revalidatePath } from "next/cache";
import { requireCaseManager } from "@/app/_lib/authorize";
import { runSampleScanForWorkspace } from "@/app/_lib/workspace-scan-store";

/**
 * Populates the caller's own real workspace with the same sample-scan
 * fixtures the public Demo Mode uses — see `workspace-scan-store.ts` for
 * why this exists. Re-running is safe: it's a full replace, not an append,
 * and existing cases stay linked (`getRightsAssessmentId` is stable across
 * runs). Same permission tier as case management (`requireCaseManager`) —
 * scans exist to feed cases, so whoever can work a case can also refresh
 * the data behind it; a VIEWER can look but not trigger new scans.
 */
export async function runSampleScanAction() {
  const session = await requireCaseManager();
  await runSampleScanForWorkspace(session.workspace.id, session.user.id);
  revalidatePath("/workspace");
}
