import { getAuditStore } from "./audit-store";
import { getAuthStore } from "./auth-store";
import { getBillingStore } from "./billing-store";
import { getCaseStore } from "./case-store";
import type { CurrentSession } from "./current-user";
import { getCreatorStore } from "./creator-store";
import { getLibraryStore } from "./library-store";
import { loadReportData } from "./report-data";
import { getReferralStore } from "./referral-store";
import { EXPORT_VERSION, exportNotes, rowsToRecords, type DataExport, type ExportScope } from "@/modules/reports";

/**
 * What the "download my data" button gives (GDPR access and portability).
 * Each section is read through the same workspace-scoped repositories the
 * pages use, so one workspace's file can never hold another's rows. Password
 * hashes, session ids and Stripe customer ids are never read into it: every
 * member and plan is copied field by field, not spread.
 */
export async function buildDataExport(session: CurrentSession, scope: ExportScope, now = new Date()): Promise<DataExport> {
  const workspaceId = session.workspace.id;
  const base = { exportVersion: EXPORT_VERSION, generatedAt: now.toISOString(), scope, notes: exportNotes(scope) } as const;

  const auth = getAuthStore();
  const [membership, cases, auditEntries] = await Promise.all([
    auth.memberships.findForUserAndWorkspace(session.user.id, workspaceId),
    getCaseStore().cases.findForWorkspace(workspaceId),
    getAuditStore().auditLogs.findForWorkspace(workspaceId),
  ]);
  const notesByCase = await Promise.all(cases.map(async (c) => ({ caseId: c.id, notes: await getCaseStore().notes.findForCase(c.id) })));
  const allNotes = notesByCase.flatMap((entry) => entry.notes);

  if (scope === "account") {
    const referrals = getReferralStore().referrals;
    const partner = await referrals.findPartnerByUser(session.user.id);
    return {
      partnerProgramme: partner
        ? {
            code: partner.code,
            termsAcceptedAt: partner.termsAcceptedAt,
            workspacesReferred: (await referrals.findReferralsForPartner(partner.id)).length,
            commissions: (await referrals.findCommissionsForPartner(partner.id)).map((c) => ({
              invoice: c.sourceId, invoiceCents: c.invoiceCents, amountCents: c.amountCents, earnedAt: c.earnedAt, paidOutAt: c.paidOutAt,
            })),
          }
        : null,
      ...base,
      workspace: { name: session.workspace.name, slug: session.workspace.slug },
      user: { id: session.user.id, email: session.user.email, name: session.user.name, emailConfirmed: session.user.emailVerified },
      membership: { role: session.role, joinedAt: membership?.createdAt ?? null },
      caseNotesWritten: allNotes.filter((note) => note.authorId === session.user.id),
      activityLogEntries: auditEntries.filter((entry) => entry.actorId === session.user.id),
    };
  }

  const memberships = await auth.memberships.findForWorkspace(workspaceId);
  const members = [];
  for (const m of memberships) {
    const user = await auth.users.findById(m.userId);
    if (user) members.push({ id: user.id, email: user.email, name: user.name, role: m.role, joinedAt: m.createdAt });
  }

  const [workspace, creators, catalogue, rights, report, subscription] = await Promise.all([
    auth.workspaces.findById(workspaceId),
    getCreatorStore().creators.findForWorkspace(workspaceId),
    getLibraryStore().catalog.findCatalogue(workspaceId),
    getLibraryStore().rights.findForWorkspace(workspaceId),
    loadReportData(session.workspace, "all", now),
    getBillingStore().subscriptions.findByWorkspaceId(workspaceId),
  ]);
  const plan = subscription ? await getBillingStore().plans.findById(subscription.planId) : null;

  return {
    ...base,
    workspace: { id: workspaceId, name: session.workspace.name, slug: session.workspace.slug, createdAt: workspace?.createdAt ?? null },
    members,
    creators,
    songs: catalogue,
    rightsRecords: rights,
    detections: rowsToRecords(report.rows()),
    cases: cases.map((c) => ({ ...c, notes: notesByCase.find((entry) => entry.caseId === c.id)?.notes ?? [] })),
    activityLog: auditEntries,
    plan: subscription
      ? { name: plan?.name ?? null, status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd, since: subscription.createdAt }
      : null,
  };
}
