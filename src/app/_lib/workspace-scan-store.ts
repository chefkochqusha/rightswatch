import { runScan } from "@/modules/scan-pipeline";
import { MockTikTokConnector } from "@/modules/connectors";
import { FixtureMusicIdentificationProvider } from "@/modules/music";
import { FixtureRightsRepository } from "@/modules/rights";
import { FixtureCampaignRepository } from "@/modules/campaigns";
import { DEMO_NAMED_CREATORS, DEMO_WINDOW_START } from "@/modules/demo-data";
import { openCase } from "@/modules/cases";
import { notifyCaseOpened } from "@/modules/notifications";
import type { ScanItemInput, StoredScanItem } from "@/modules/scan-results";
import { getCaseStore } from "./case-store";
import { getNotificationStore } from "./notification-store";
import { getAuthStore } from "./auth-store";
import { getAuditStore } from "./audit-store";
import { getScanResultStore } from "./scan-result-store";

/**
 * Per-workspace "sample scan" results for the real, authenticated app —
 * distinct from `get-demo-scan-results.ts` (which recomputes fresh on every
 * request, for the public Demo Mode) even though both call the exact same
 * `runScan()` pipeline against the exact same mock connector and fixture
 * providers.
 *
 * Why this exists: a freshly signed-up workspace has no real TikTok
 * connection yet (Phase 10 is still gated on API access), so it would
 * otherwise sit completely empty. "Run a sample scan" shows what a real scan
 * produces, *stored in that workspace* (`modules/scan-results`, Postgres) —
 * which is what makes opening real Cases against these items meaningful: a
 * Case's `rightsAssessmentId` points at a real `RightsAssessment` row. The
 * only thing Phase 10 changes is swapping `MockTikTokConnector` for the real
 * one; storage and the pipeline call stay as they are.
 *
 * `runSampleScanForWorkspace` also carries out the pipeline's documented
 * next steps (`scan-pipeline/types.ts`: "Rights Engine → Case Creation →
 * Notifications"), so a flagged item is tracked as a Case the moment a scan
 * finds it, and every workspace member has an in-app notification about it.
 * Notifications are in-app only — there's no email provider yet
 * (RELEASE_CHECKLIST.md).
 */

// From the start of the demo dataset's scenarios up to now: the scenarios,
// plus whatever the six named creators have "posted" since.
const SINCE = DEMO_WINDOW_START;

/** One stored scan item, as the workspace pages render it. */
export type WorkspaceScanItem = StoredScanItem;

export async function getWorkspaceScanItems(workspaceId: string): Promise<WorkspaceScanItem[]> {
  return getScanResultStore().results.findForWorkspace(workspaceId);
}

/** Scoped by workspace: another workspace's item is never returned, even for
 *  the same video. */
export async function getWorkspaceScanItem(
  workspaceId: string,
  contentId: string,
): Promise<WorkspaceScanItem | null> {
  return getScanResultStore().results.findByContentId(workspaceId, contentId);
}

export async function runSampleScanForWorkspace(
  workspaceId: string,
  /** The user who clicked "Run a sample scan" — threaded through only so
   *  any case this run opens can be audit-logged against a real actor
   *  rather than `null`. */
  triggeredByUserId: string,
): Promise<WorkspaceScanItem[]> {
  const connector = new MockTikTokConnector();
  const musicProvider = new FixtureMusicIdentificationProvider();
  const rightsRepository = new FixtureRightsRepository();
  const campaignRepository = new FixtureCampaignRepository();

  const now = new Date();
  const perCreator = await Promise.all(
    DEMO_NAMED_CREATORS.map(async (creator): Promise<ScanItemInput[]> => {
      const result = await runScan({
        connector,
        musicProvider,
        getRightsRecordsForTrack: (trackId) => rightsRepository.getRecordsForTrack(trackId),
        getCampaignIdsForCreator: async (creatorExternalId) =>
          (await campaignRepository.findForCreator(creatorExternalId)).map((c) => c.id),
        creatorExternalId: creator.handle,
        creatorUsername: creator.handle,
        creatorCountry: creator.country,
        since: SINCE,
        until: now,
      });
      return result.items.map((item) => ({
        ...item,
        creatorExternalId: creator.handle,
        creatorUsername: creator.handle,
      }));
    }),
  );

  // Stored first, so every flagged item has a real `RightsAssessment` row
  // for its Case to point at. Re-running keeps the same rows — and so every
  // existing Case stays attached (see `modules/scan-results/types.ts`).
  const items = await getScanResultStore().results.saveScan({
    workspaceId,
    musicProviderName: musicProvider.providerName,
    items: perCreator.flat(),
  });

  // Case Creation: only for items the Rights Engine flagged — a CLEARED
  // assessment has nothing to investigate. `openCase` is idempotent, so a
  // re-run never duplicates an open case or disturbs one a human has since
  // moved to RESOLVED/DISMISSED; it only fills in cases for items that
  // don't have one yet.
  const caseRepository = getCaseStore().cases;
  // Every current member hears about a new case, not just OWNER/ADMIN/
  // ANALYST: a notification is visibility, not a mutation, and this app
  // never gates visibility by role (ARCHITECTURE.md → "Auth &
  // authorization"). Looked up once per scan, not once per flagged item.
  const memberships = await getAuthStore().memberships.findForWorkspace(workspaceId);
  const recipientUserIds = memberships.map((m) => m.userId);
  const notificationRepository = getNotificationStore().notifications;

  for (const item of items) {
    if (item.kind !== "ASSESSED" || item.assessment.status === "CLEARED") continue;

    const result = await openCase(
      { workspaceId, rightsAssessmentId: item.rightsAssessmentId },
      { caseRepository },
    );
    // Only a genuinely new case is announced and audited — re-running a
    // scan never re-notifies about a case that's been there since yesterday.
    if (result.created) {
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
      // (`case-actions.ts`'s `openCaseAction`) — this is the more common of
      // the two, since a scan opens a case for every flagged item.
      await getAuditStore().auditLogs.create({
        workspaceId,
        actorId: triggeredByUserId,
        action: "case.opened",
        targetType: "case",
        targetId: result.case.id,
      });
    }
  }

  return items;
}
