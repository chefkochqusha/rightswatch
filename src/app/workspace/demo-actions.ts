"use server";

import { revalidatePath } from "next/cache";
import { requireCaseManager } from "@/app/_lib/authorize";
import { getConnectorMode } from "@/app/_lib/connector-mode";
import { loadDemoWorkspace } from "@/app/_lib/demo-workspace";
import { runWorkspaceScan } from "@/app/_lib/workspace-scan-store";

/**
 * "Try it with demo data" — demo mode only: the demo creators, songs and
 * rights records (`demo-workspace.ts`), then a scan, so the feed fills with
 * every kind of verdict straight away.
 */
export async function loadDemoDataAction(): Promise<void> {
  const session = await requireCaseManager();
  if (getConnectorMode() !== "DEMO") throw new Error("Demo data is only available in demo mode.");
  await loadDemoWorkspace(session.workspace.id, session.user.id);
  await runWorkspaceScan(session.workspace.id, session.user.id);
  revalidatePath("/workspace", "layout");
}
