import { getCaseStore } from "@/app/_lib/case-store";
import { getWorkspaceMembers } from "@/app/_lib/members";
import { CaseStatusBadge } from "@/components/cases/case-status-badge";
import { CasePriorityBadge } from "@/components/cases/case-priority-badge";
import { CASE_PRIORITY_LABELS, CASE_STATUS_HINTS, CASE_STATUS_LABELS } from "@/components/cases/labels";
import type { CasePriority, CaseStatus } from "@/modules/cases";
import {
  openCaseAction,
  updateCaseStatusAction,
  setCasePriorityAction,
  assignCaseAction,
  addCaseNoteAction,
} from "./case-actions";

const CASE_STATUSES: CaseStatus[] = ["OPEN", "IN_PROGRESS", "WAITING", "CLEARED", "RESOLVED", "DISMISSED"];
const CASE_PRIORITIES: CasePriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

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
  rightsAssessmentId,
  contentId,
  currentUserId,
  currentUserName,
  canManage,
}: {
  /** The assessment this item's case belongs to (1:1 by schema). */
  rightsAssessmentId: string;
  /** Posted back by the case forms, which re-resolve the item themselves. */
  contentId: string;
  currentUserId: string;
  currentUserName: string;
  canManage: boolean;
}) {
  const store = getCaseStore();
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

  const [notes, members] = await Promise.all([store.notes.findForCase(existingCase.id), getWorkspaceMembers(existingCase.workspaceId)]);
  const nameOf = new Map(members.map((member) => [member.userId, member.name]));
  const assignee = existingCase.assignedToId ? (nameOf.get(existingCase.assignedToId) ?? "A former member") : null;

  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Case</h2>
        <div className="flex items-center gap-3">
          <CasePriorityBadge priority={existingCase.priority} />
          <CaseStatusBadge status={existingCase.status} />
        </div>
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
                title={CASE_STATUS_HINTS[status]}
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

      <dl className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        <div>
          <dt className="text-[0.8125rem] text-t2">Priority</dt>
          <dd className="mt-1">
            {canManage ? (
              <form action={setCasePriorityAction} className="flex items-center gap-2">
                <input type="hidden" name="contentId" value={contentId} />
                <select name="priority" defaultValue={existingCase.priority} aria-label="Priority" className="h-8 rounded-lg border border-line bg-surface px-2 text-sm text-tx">
                  {CASE_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {CASE_PRIORITY_LABELS[priority]}
                    </option>
                  ))}
                </select>
                <button type="submit" className="text-[0.8125rem] font-medium text-accent hover:underline">Save</button>
              </form>
            ) : (
              <span className="text-sm">{CASE_PRIORITY_LABELS[existingCase.priority]}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[0.8125rem] text-t2">Assigned to</dt>
          <dd className="mt-1">
            {canManage ? (
              <form action={assignCaseAction} className="flex items-center gap-2">
                <input type="hidden" name="contentId" value={contentId} />
                <select name="assigneeId" defaultValue={existingCase.assignedToId ?? ""} aria-label="Assigned to" className="h-8 max-w-44 rounded-lg border border-line bg-surface px-2 text-sm text-tx">
                  <option value="">Nobody</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.userId === currentUserId ? `${member.name} (you)` : member.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="text-[0.8125rem] font-medium text-accent hover:underline">Save</button>
              </form>
            ) : (
              <span className="text-sm">{assignee ?? "Nobody"}</span>
            )}
          </dd>
        </div>
      </dl>

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
                  {note.authorId === currentUserId ? currentUserName : (nameOf.get(note.authorId) ?? "A former member")} ·{" "}
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
