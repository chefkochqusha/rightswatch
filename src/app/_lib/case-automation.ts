import { openCase, priorityForVerdict } from "@/modules/cases";
import { notifyCaseOpened } from "@/modules/notifications";
import type { StoredScanItem } from "@/modules/scan-results";
import { getCaseStore } from "./case-store";
import { getNotificationStore } from "./notification-store";
import { getAuthStore } from "./auth-store";
import { getAuditStore } from "./audit-store";
import { sendNewCaseAlerts } from "./case-alerts";
import { DEMO_WORKSPACE_SLUG } from "./demo-constants";

/**
 * Case Creation (Brief §51): a case for every assessed item the Rights
 * Engine didn't clear — a CLEARED one has nothing to investigate. Run after
 * a scan, and after a song is re-assessed between scans (it joined the
 * catalogue, or its rights records changed).
 *
 * `openCase` is idempotent, so a re-run never duplicates a case or disturbs
 * one a human has since resolved; only genuinely new cases are announced to
 * every member (a notification is visibility, not a mutation —
 * ARCHITECTURE.md → "Auth & authorization") and audit-logged, with whoever
 * set the run off as the actor (nobody, for a scheduled run).
 */
export async function openCasesForFlaggedItems(
  workspaceId: string,
  actorUserId: string | null,
  items: StoredScanItem[],
): Promise<number> {
  const caseRepository = getCaseStore().cases;
  const notificationRepository = getNotificationStore().notifications;
  const memberships = await getAuthStore().memberships.findForWorkspace(workspaceId);
  const recipientUserIds = memberships.map((m) => m.userId);

  let opened = 0;
  const openedCases: { contentId: string; creatorUsername: string; status: string }[] = [];
  for (const item of items) {
    if (item.kind !== "ASSESSED" || item.assessment.status === "CLEARED") continue;

    const result = await openCase(
      { workspaceId, rightsAssessmentId: item.rightsAssessmentId, priority: priorityForVerdict(item.assessment.status) },
      { caseRepository },
    );
    if (!result.created) continue;
    opened += 1;
    openedCases.push({ contentId: item.content.externalContentId, creatorUsername: item.creatorUsername, status: item.assessment.status });

    await notifyCaseOpened(
      {
        workspaceId,
        recipientUserIds,
        payload: {
          caseId: result.case.id,
          contentId: item.content.externalContentId,
          creatorUsername: item.creatorUsername,
          status: item.assessment.status,
        },
      },
      { notificationRepository },
    );
    // The same action/targetType as the manual "Open a case" path
    // (`case-actions.ts`'s `openCaseAction`).
    await getAuditStore().auditLogs.create({
      workspaceId,
      actorId: actorUserId,
      action: "case.opened",
      targetType: "case",
      targetId: result.case.id,
    });
  }
  // Not for the public demo workspace: nobody there wants mail.
  const workspace = await getAuthStore().workspaces.findById(workspaceId);
  if (workspace && workspace.slug !== DEMO_WORKSPACE_SLUG) await sendNewCaseAlerts(workspaceId, openedCases);
  return opened;
}
