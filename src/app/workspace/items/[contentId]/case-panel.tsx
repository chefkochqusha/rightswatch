import { getCaseStore } from "@/app/_lib/case-store";
import { getRightsAssessmentId } from "@/app/_lib/workspace-scan-store";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import { CASE_STATUS_LABELS } from "@/components/cases/labels";
import type { CaseStatus } from "@/modules/cases";
import {
  openCaseAction,
  updateCaseStatusAction,
  toggleAssignToMeAction,
  addCaseNoteAction,
} from "./case-actions";

const CASE_STATUSES: CaseStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"];

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * The case-management panel for a real workspace's item detail page. Only
 * ever rendered by the caller for an `ASSESSED` item (a case is 1:1 with a
 * rights assessment), so it doesn't need to handle "no assessment" itself
 * — only "no case opened yet" vs. "case exists".
 *
 * A plain async Server Component, not a client component: every mutation
 * goes through a `<form action={...}>` bound to a Server Action, so the
 * whole panel works with zero client JS (and is verifiable the same way
 * the auth flows were — a no-JS form POST).
 *
 * `canManage` (OWNER/ADMIN/ANALYST — see `app/_lib/authorize.ts`) decides
 * whether the mutating forms render at all. It's purely a UI convenience:
 * `case-actions.ts`'s `requireAssessedItem` is the real, server-enforced
 * gate, so a VIEWER can't mutate a case even by hand-crafting a request
 * against a stale page that still shows these forms.
 */
export async function CasePanel({
  workspaceId,
  contentId,
  currentUserId,
  currentUserName,
  canManage,
}: {
  workspaceId: string;
  contentId: string;
  currentUserId: string;
  currentUserName: string;
  canManage: boolean;
}) {
  const store = getCaseStore();
  const rightsAssessmentId = getRightsAssessmentId(workspaceId, contentId);
  const existingCase = await store.cases.findByRightsAssessmentId(rightsAssessmentId);

  if (!existingCase) {
    return (
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">Case</h2>
        <p className="mt-2 text-sm text-t2">
          No case has been opened for this assessment yet.{" "}
          {canManage
            ? "Opening one lets you track its status and keep notes as you work it."
            : "Ask an owner, admin, or analyst to open one."}
        </p>
        {canManage && (
          <form action={openCaseAction} className="mt-4">
            <input type="hidden" name="contentId" value={contentId} />
            <button
              type="submit"
              className="rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
            >
              Open a case
            </button>
          </form>
        )}
      </section>
    );
  }

  const notes = await store.notes.findForCase(existingCase.id);
  const isAssignedToMe = existingCase.assignedToId === currentUserId;

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Case</h2>
        <CaseStatusBadge status={existingCase.status} />
      </div>
      <p className="mt-1 text-[0.8125rem] text-t2">
        Opened {dateTimeFormatter.format(existingCase.createdAt)}
      </p>

      {canManage && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {CASE_STATUSES.map((status) => (
            <form key={status} action={updateCaseStatusAction}>
              <input type="hidden" name="contentId" value={contentId} />
              <input type="hidden" name="status" value={status} />
              <button
                type="submit"
                disabled={existingCase.status === status}
                className={
                  existingCase.status === status
                    ? "rounded-full bg-tx px-3 py-1.5 text-[0.8125rem] font-medium text-bg"
                    : "rounded-full border border-line px-3 py-1.5 text-[0.8125rem] font-medium text-t2 hover:bg-hover hover:text-tx"
                }
              >
                {CASE_STATUS_LABELS[status]}
              </button>
            </form>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-[0.8125rem] text-t2">
          {existingCase.assignedToId
            ? isAssignedToMe
              ? "Assigned to you"
              : "Assigned to a teammate"
            : "Unassigned"}
        </p>
        {canManage && (
          <form action={toggleAssignToMeAction}>
            <input type="hidden" name="contentId" value={contentId} />
            <button
              type="submit"
              className="text-[0.8125rem] font-medium text-accent hover:underline"
            >
              {isAssignedToMe ? "Unassign yourself" : "Assign to me"}
            </button>
          </form>
        )}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-[0.8125rem] font-semibold text-t2">
          Notes{notes.length > 0 ? ` (${notes.length})` : ""}
        </h3>
        {notes.length === 0 ? (
          <p className="mt-2 text-[0.8125rem] text-t2">No notes yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-md bg-surface-2 p-3">
                <p className="text-sm whitespace-pre-wrap text-tx">{note.body}</p>
                <p className="mt-1.5 text-[0.75rem] text-t2">
                  {note.authorId === currentUserId ? currentUserName : "Teammate"} ·{" "}
                  {dateTimeFormatter.format(note.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <form action={addCaseNoteAction} className="mt-4">
            <input type="hidden" name="contentId" value={contentId} />
            <textarea
              name="body"
              required
              rows={3}
              placeholder="Add a note…"
              aria-label="Add a note"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-tx placeholder:text-t2 focus:ring-2 focus:ring-accent focus:outline-none"
            />
            <button
              type="submit"
              className="mt-2 rounded-full border border-line px-3 py-1.5 text-[0.8125rem] font-medium text-t2 hover:bg-hover hover:text-tx"
            >
              Add note
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
