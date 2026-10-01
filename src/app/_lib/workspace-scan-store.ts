import { runScan } from "@/modules/scan-pipeline";
import { MockTikTokConnector } from "@/modules/connectors";
import { FixtureMusicIdentificationProvider } from "@/modules/music";
import { FixtureRightsRepository } from "@/modules/rights";
import { FixtureCampaignRepository } from "@/modules/campaigns";
import { DEMO_WINDOW_START } from "@/modules/demo-data";
import { openCase } from "@/modules/cases";
import { notifyCaseOpened } from "@/modules/notifications";
import { scanOutcomeChanges, type CreatorRecord } from "@/modules/creators";
import {
  SCAN_JOB_TYPE,
  emptyScanPayload,
  type JobRecord,
  type ScanJobCreatorResult,
  type ScanJobPayload,
} from "@/modules/jobs";
import type { ScanItemInput, StoredScanItem } from "@/modules/scan-results";
import { getCaseStore } from "./case-store";
import { getNotificationStore } from "./notification-store";
import { getAuthStore } from "./auth-store";
import { getAuditStore } from "./audit-store";
import { getScanResultStore } from "./scan-result-store";
import { getCreatorStore } from "./creator-store";
import { getJobStore } from "./job-store";
import { getCreatorAllowance } from "./creator-allowance";
import { getConnectorMode } from "./connector-mode";

/**
 * A workspace's scan (Brief §21, §50): fetch each monitored creator's
 * commercial content, identify the music, assess the rights, store the
 * results, open a case for anything flagged, and tell the team.
 *
 * - **Who is scanned** is the watchlist (`modules/creators`): creators not
 *   removed and not paused, oldest first, up to the plan's limit (§19) —
 *   any beyond it are left out and counted, not silently dropped.
 * - **Which window**: everything since the creator was last reached (with
 *   a day's overlap, so a post published while the last scan ran isn't
 *   missed), or the last 30 days for a creator never scanned. In demo mode
 *   a first scan reaches back to the start of the demo dataset's scenarios
 *   instead, so a new workspace sees all of them.
 * - **Every run is a `Job`** (§21), created when it starts and completed
 *   or failed when it ends, with per-creator results as its payload — what
 *   a creator's monitoring history (§8) and "last scan" (§7) read.
 *
 * Until the real TikTok connector exists (`connector-mode.ts`), the
 * connector, music identification, rights records and campaigns are the
 * demo dataset's. Swapping in the real ones changes nothing below.
 */

const INITIAL_LOOKBACK_DAYS = 30;
const DAY_MS = 86_400_000;

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

export type RunWorkspaceScanResult =
  | { ok: true; job: JobRecord<ScanJobPayload> }
  | { ok: false; error: "NO_PLAN" | "NO_CREATORS" };

export async function runWorkspaceScan(
  workspaceId: string,
  /** Who started it — recorded on the job, and the actor of any case it
   *  opens in the audit log. */
  triggeredByUserId: string,
): Promise<RunWorkspaceScanResult> {
  const allowance = await getCreatorAllowance(workspaceId);
  if (allowance.cap <= 0) return { ok: false, error: "NO_PLAN" };

  const creatorRepository = getCreatorStore().creators;
  const monitored = (await creatorRepository.findForWorkspace(workspaceId)).filter((c) => c.monitoringEnabled);
  if (monitored.length === 0) return { ok: false, error: "NO_CREATORS" };
  const creators = monitored.slice(0, allowance.cap);

  const connectorMode = getConnectorMode();
  const jobs = getJobStore().jobs;
  const startedAt = new Date();
  const payload = emptyScanPayload({
    triggeredByUserId,
    connectorMode,
    creatorsTotal: creators.length,
    skippedOverLimit: monitored.length - creators.length,
  });
  const job = await jobs.create<ScanJobPayload>({
    workspaceId,
    type: SCAN_JOB_TYPE,
    status: "RUNNING",
    attempts: 1,
    startedAt,
    payload,
  });

  try {
    const final = await scanCreators(workspaceId, triggeredByUserId, creators, startedAt, payload);
    return {
      ok: true,
      job: await jobs.update<ScanJobPayload>(job.id, { status: "COMPLETED", completedAt: new Date(), payload: final }),
    };
  } catch (error) {
    await jobs.update<ScanJobPayload>(job.id, {
      status: "FAILED",
      completedAt: new Date(),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function scanCreators(
  workspaceId: string,
  triggeredByUserId: string,
  creators: CreatorRecord[],
  now: Date,
  payload: ScanJobPayload,
): Promise<ScanJobPayload> {
  const connector = new MockTikTokConnector();
  const musicProvider = new FixtureMusicIdentificationProvider();
  const rightsRepository = new FixtureRightsRepository();
  const campaignRepository = new FixtureCampaignRepository();
  const results = getScanResultStore().results;
  const creatorRepository = getCreatorStore().creators;

  // Fetch: one creator at a time — a real connector is rate-limited, and
  // one failing creator mustn't stop the rest (Brief §37).
  const items: ScanItemInput[] = [];
  const perCreator: ScanJobCreatorResult[] = [];
  for (const creator of creators) {
    const result = await runScan({
      connector,
      musicProvider,
      getRightsRecordsForTrack: (trackId) => rightsRepository.getRecordsForTrack(trackId),
      getCampaignIdsForCreator: async (creatorExternalId) =>
        (await campaignRepository.findForCreator(creatorExternalId)).map((c) => c.id),
      creatorExternalId: creator.externalId,
      creatorUsername: creator.handle,
      creatorCountry: creator.country,
      since: windowStart(creator, now),
      until: now,
    });
    perCreator.push({
      creatorId: creator.id,
      handle: creator.handle,
      videos: result.items.length,
      matches: result.items.filter((item) => item.kind === "ASSESSED").length,
      error: result.connectorError,
    });
    for (const item of result.items) {
      items.push({ ...item, creatorId: creator.id, creatorExternalId: creator.externalId, creatorUsername: creator.handle });
    }
  }

  // Store: every flagged item gets a real `RightsAssessment` row for its
  // case to point at. What was there before tells new matches from known.
  const known = new Set(
    (await results.findForWorkspace(workspaceId)).flatMap((item) => (item.rightsAssessmentId ? [item.rightsAssessmentId] : [])),
  );
  const stored = await results.saveScan({ workspaceId, musicProviderName: musicProvider.providerName, items });

  for (const [index, creator] of creators.entries()) {
    await creatorRepository.update(creator.id, scanOutcomeChanges(creator, { at: now, error: perCreator[index].error }));
  }

  const casesOpened = await openCasesForFlaggedItems(workspaceId, triggeredByUserId, stored);

  return {
    ...payload,
    videosChecked: items.length,
    matches: stored.filter((item) => item.kind === "ASSESSED").length,
    newMatches: stored.filter((item) => item.rightsAssessmentId && !known.has(item.rightsAssessmentId)).length,
    casesOpened,
    creators: perCreator,
  };
}

function windowStart(creator: CreatorRecord, now: Date): Date {
  if (creator.lastSeenAt) return new Date(creator.lastSeenAt.getTime() - DAY_MS);
  const lookback = new Date(now.getTime() - INITIAL_LOOKBACK_DAYS * DAY_MS);
  return getConnectorMode() === "DEMO" && DEMO_WINDOW_START < lookback ? DEMO_WINDOW_START : lookback;
}

/**
 * Case Creation (Brief §51): a case for every assessed item the Rights
 * Engine didn't clear — a CLEARED one has nothing to investigate.
 * `openCase` is idempotent, so a re-run never duplicates a case or
 * disturbs one a human has since resolved; only genuinely new cases are
 * announced to every member (a notification is visibility, not a mutation
 * — ARCHITECTURE.md → "Auth & authorization") and audit-logged.
 */
async function openCasesForFlaggedItems(
  workspaceId: string,
  triggeredByUserId: string,
  items: StoredScanItem[],
): Promise<number> {
  const caseRepository = getCaseStore().cases;
  const notificationRepository = getNotificationStore().notifications;
  const memberships = await getAuthStore().memberships.findForWorkspace(workspaceId);
  const recipientUserIds = memberships.map((m) => m.userId);

  let opened = 0;
  for (const item of items) {
    if (item.kind !== "ASSESSED" || item.assessment.status === "CLEARED") continue;

    const result = await openCase({ workspaceId, rightsAssessmentId: item.rightsAssessmentId }, { caseRepository });
    if (!result.created) continue;
    opened += 1;

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
      actorId: triggeredByUserId,
      action: "case.opened",
      targetType: "case",
      targetId: result.case.id,
    });
  }
  return opened;
}
