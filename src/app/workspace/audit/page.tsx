import { requireSession } from "@/app/_lib/current-user";
import { getAuthStore } from "@/app/_lib/auth-store";
import { getAuditStore } from "@/app/_lib/audit-store";
import { getCaseStore } from "@/app/_lib/case-store";
import { getWorkspaceScanItems } from "@/app/_lib/workspace-scan-store";
import { WorkspaceHeader } from "@/components/layout/workspace-header";
import { AuditLogRow } from "@/components/audit/audit-log-row";
import { buildAuditLogView } from "@/components/audit/audit-log-view";
import type { UserRecord } from "@/modules/auth";
import type { CaseRecord } from "@/modules/cases";

export const metadata = {
  title: "Audit log — RightsWatch",
};

/**
 * Every audit-log entry for the caller's workspace, newest first — the
 * read side of `modules/audit`, whose own `types.ts` doc comment flagged
 * this page as "a separate, later unit of work" when the write side
 * (case-lifecycle logging in `case-actions.ts` / `workspace-scan-store.ts`)
 * was built. No role gate beyond having a session at all: visibility is
 * never role-gated in this app (see `ARCHITECTURE.md` → "Auth &
 * authorization"), the same reasoning `notifications/page.tsx` and
 * `team/page.tsx` already apply to their own read-only views.
 */
export default async function AuditLogPage() {
  const session = await requireSession();
  const entries = await getAuditStore().auditLogs.findForWorkspace(session.workspace.id);

  // Resolve every current member once, the same way `team/page.tsx` does —
  // reused below both for the "who did this" column and for the assignee
  // names inside `case.assignee_changed` metadata.
  const authStore = getAuthStore();
  const memberships = await authStore.memberships.findForWorkspace(session.workspace.id);
  const members = new Map<string, UserRecord>();
  for (const membership of memberships) {
    const user = await authStore.users.findById(membership.userId);
    // Same defensive skip as `team/page.tsx`: every membership should
    // resolve to a real user by construction, but don't crash the page if
    // one somehow doesn't.
    if (user) members.set(user.id, user);
  }

  // Resolve every distinct case a "case"-targeted entry points at, once per
  // case rather than once per entry, so a case with a long history doesn't
  // repeat the same lookup for every row.
  const caseStore = getCaseStore();
  const caseTargetIds = Array.from(
    new Set(entries.filter((entry) => entry.targetType === "case").map((entry) => entry.targetId)),
  );
  const casesById = new Map<string, CaseRecord>();
  for (const id of caseTargetIds) {
    const relatedCase = await caseStore.cases.findById(id);
    if (relatedCase) casesById.set(id, relatedCase);
  }

  const contentIdByRightsAssessmentId = new Map<string, string>();
  for (const item of await getWorkspaceScanItems(session.workspace.id)) {
    if (item.rightsAssessmentId) {
      contentIdByRightsAssessmentId.set(item.rightsAssessmentId, item.content.externalContentId);
    }
  }

  const rows = buildAuditLogView(entries, {
    currentUserId: session.user.id,
    members,
    casesById,
    contentIdByRightsAssessmentId,
  });

  return (
    <div className="flex min-h-screen flex-col">
      <WorkspaceHeader />

      <main className="mx-auto w-full max-w-(--content-width) flex-1 px-6 py-8 [--content-width:1100px]">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="mt-1 text-sm text-t2">
            Every case action taken in {session.workspace.name}, newest first.
          </p>
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
          {rows.length === 0 ? (
            <div className="p-8 text-center">
              <h2 className="text-sm font-semibold">No activity yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-t2">
                You&rsquo;ll see an entry here whenever a case is opened, its status changes, or
                it&rsquo;s reassigned.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-[0.8125rem] text-t2">
                    <th className="px-5 py-3 font-medium">When</th>
                    <th className="px-5 py-3 font-medium">Who</th>
                    <th className="px-5 py-3 font-medium">What</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => (
                    <AuditLogRow key={entry.id} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
