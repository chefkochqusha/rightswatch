"use server";

import { revalidatePath } from "next/cache";
import { requireCaseManager } from "@/app/_lib/authorize";
import { getCaseStore } from "@/app/_lib/case-store";
import { getAuditStore } from "@/app/_lib/audit-store";
import { getWorkspaceScanItem } from "@/app/_lib/workspace-scan-store";
import { openCase, addCaseNote, updateCase } from "@/modules/cases";
import type { CaseStatus } from "@/modules/cases";

const CASE_STATUSES: CaseStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"];

/**
 * Every case action starts here: confirms the caller is at least an
 * ANALYST (`requireCaseManager` — a VIEWER can read a case via
 * `case-panel.tsx` but not mutate one, now that ANALYST/VIEWER are reachable
 * via `modules/auth/invite-teammate.ts`), that the content item they're
 * pointing at exists in *their* workspace's sample-scan results (never
 * another workspace's — `getWorkspaceScanItem` is already scoped by
 * `session.workspace.id`), and that it was actually assessed. A case is
 * 1:1 with a rights assessment (`modules/cases/types`), so there's nothing
 * to open, assign, or note on for a `NO_MUSIC_MATCH` or `MUSIC_ID_ERROR`
 * item — the UI never offers these actions for those, but this guard holds
 * even against a hand-crafted request.
 */
async function requireAssessedItem(contentId: string) {
  const session = await requireCaseManager();
  const item = await getWorkspaceScanItem(session.workspace.id, contentId);
  if (!item || item.kind !== "ASSESSED") {
    throw new Error("No rights assessment exists for this content item.");
  }
  return { session, item, rightsAssessmentId: item.rightsAssessmentId };
}

export async function openCaseAction(formData: FormData) {
  const contentId = String(formData.get("contentId") ?? "");
  const { session, rightsAssessmentId } = await requireAssessedItem(contentId);
  const store = getCaseStore();
  const result = await openCase(
    { workspaceId: session.workspace.id, rightsAssessmentId },
    { caseRepository: store.cases },
  );
  // Same idempotency-respecting check as `workspace-scan-store.ts`'s
  // `notifyCaseOpened` call: `openCase` is safe to call on an
  // already-open case (returns the existing one rather than erroring),
  // so only a genuinely new case is worth an audit entry.
  if (result.created) {
    await getAuditStore().auditLogs.create({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      action: "case.opened",
      targetType: "case",
      targetId: result.case.id,
    });
  }
  revalidatePath(`/workspace/items/${contentId}`);
  revalidatePath("/workspace");
}

export async function updateCaseStatusAction(formData: FormData) {
  const contentId = String(formData.get("contentId") ?? "");
  const rawStatus = String(formData.get("status") ?? "");
  if (!CASE_STATUSES.includes(rawStatus as CaseStatus)) {
    throw new Error(`Unrecognized case status: ${rawStatus}`);
  }
  const { session, rightsAssessmentId } = await requireAssessedItem(contentId);
  const store = getCaseStore();
  const existing = await store.cases.findByRightsAssessmentId(rightsAssessmentId);
  if (!existing) throw new Error("No case exists yet for this content item.");
  await updateCase(
    { caseId: existing.id, status: rawStatus as CaseStatus },
    { caseRepository: store.cases },
  );
  // The UI disables the button for the case's current status, so a normal
  // click never gets here with `rawStatus === existing.status` — but a
  // hand-crafted request could, and a "changed from RESOLVED to RESOLVED"
  // entry would just be noise in the trail, not a real event.
  if (existing.status !== rawStatus) {
    await getAuditStore().auditLogs.create({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      action: "case.status_changed",
      targetType: "case",
      targetId: existing.id,
      metadata: { from: existing.status, to: rawStatus },
    });
  }
  revalidatePath(`/workspace/items/${contentId}`);
  revalidatePath("/workspace");
}

export async function toggleAssignToMeAction(formData: FormData) {
  const contentId = String(formData.get("contentId") ?? "");
  const { session, rightsAssessmentId } = await requireAssessedItem(contentId);
  const store = getCaseStore();
  const existing = await store.cases.findByRightsAssessmentId(rightsAssessmentId);
  if (!existing) throw new Error("No case exists yet for this content item.");
  const nextAssignee = existing.assignedToId === session.user.id ? null : session.user.id;
  await updateCase(
    { caseId: existing.id, assignedToId: nextAssignee },
    { caseRepository: store.cases },
  );
  await getAuditStore().auditLogs.create({
    workspaceId: session.workspace.id,
    actorId: session.user.id,
    action: "case.assignee_changed",
    targetType: "case",
    targetId: existing.id,
    metadata: { from: existing.assignedToId, to: nextAssignee },
  });
  revalidatePath(`/workspace/items/${contentId}`);
}

// `addCaseNoteAction` deliberately doesn't write an audit entry: a note
// already shows its own author and timestamp inline in the UI
// (`case-panel.tsx`), so a separate audit-log row for it would just
// duplicate information that's already visible and attributed on its own.
export async function addCaseNoteAction(formData: FormData) {
  const contentId = String(formData.get("contentId") ?? "");
  const body = String(formData.get("body") ?? "");
  const { session, rightsAssessmentId } = await requireAssessedItem(contentId);
  const store = getCaseStore();
  const existing = await store.cases.findByRightsAssessmentId(rightsAssessmentId);
  if (!existing) throw new Error("No case exists yet for this content item.");
  await addCaseNote(
    { caseId: existing.id, authorId: session.user.id, body },
    { caseRepository: store.cases, caseNoteRepository: store.notes },
  );
  revalidatePath(`/workspace/items/${contentId}`);
}
