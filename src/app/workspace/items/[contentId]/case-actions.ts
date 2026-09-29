"use server";

import { revalidatePath } from "next/cache";
import { requireCaseManager } from "@/app/_lib/authorize";
import { getCaseStore } from "@/app/_lib/case-store";
import { getWorkspaceScanItem, getRightsAssessmentId } from "@/app/_lib/workspace-scan-store";
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
  const item = getWorkspaceScanItem(session.workspace.id, contentId);
  if (!item || item.kind !== "ASSESSED") {
    throw new Error("No rights assessment exists for this content item.");
  }
  return {
    session,
    item,
    rightsAssessmentId: getRightsAssessmentId(session.workspace.id, contentId),
  };
}

export async function openCaseAction(formData: FormData) {
  const contentId = String(formData.get("contentId") ?? "");
  const { session, rightsAssessmentId } = await requireAssessedItem(contentId);
  const store = getCaseStore();
  await openCase(
    { workspaceId: session.workspace.id, rightsAssessmentId },
    { caseRepository: store.cases },
  );
  revalidatePath(`/workspace/items/${contentId}`);
  revalidatePath("/workspace");
}

export async function updateCaseStatusAction(formData: FormData) {
  const contentId = String(formData.get("contentId") ?? "");
  const rawStatus = String(formData.get("status") ?? "");
  if (!CASE_STATUSES.includes(rawStatus as CaseStatus)) {
    throw new Error(`Unrecognized case status: ${rawStatus}`);
  }
  const { rightsAssessmentId } = await requireAssessedItem(contentId);
  const store = getCaseStore();
  const existing = await store.cases.findByRightsAssessmentId(rightsAssessmentId);
  if (!existing) throw new Error("No case exists yet for this content item.");
  await updateCase(
    { caseId: existing.id, status: rawStatus as CaseStatus },
    { caseRepository: store.cases },
  );
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
  revalidatePath(`/workspace/items/${contentId}`);
}

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
