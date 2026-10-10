import { runScan } from "@/modules/scan-pipeline";
import { MockTikTokConnector, TikTokCommercialContentConnector, type PlatformConnector } from "@/modules/connectors";
import { FixtureMusicIdentificationProvider, type MusicIdentificationProvider } from "@/modules/music";
import { PrismaCampaignRepository } from "@/modules/campaigns/prisma-repository";
import { toRightsRecordInput } from "@/modules/rights";
import type { RightsRecordInput } from "@/modules/rights-engine/types";
import { findSameTrack } from "@/modules/catalog";
import { DEMO_WINDOW_START } from "@/modules/demo-data";
import { scanOutcomeChanges, type CreatorRecord } from "@/modules/creators";
import {
  SCAN_JOB_TYPE,
  emptyScanPayload,
  type JobRecord,
  type ScanJobCreatorResult,
  type ScanJobPayload,
} from "@/modules/jobs";
import type { ScanItemInput, StoredScanItem } from "@/modules/scan-results";
import { getScanResultStore } from "./scan-result-store";
import { getCreatorStore } from "./creator-store";
import { getJobStore } from "./job-store";
import { getLibraryStore } from "./library-store";
import { getCreatorAllowance } from "./creator-allowance";
import { getAuthStore } from "./auth-store";
import { dataModeFor, getTikTokCredentials, type ConnectorMode } from "./connector-mode";
import { openCasesForFlaggedItems } from "./case-automation";
import { getRecognitionProvider } from "./recognition";

/**
 * A workspace's scan (Brief §21, §50): fetch each monitored creator's
 * commercial content, identify the music, assess the posts that use a song
 * in the workspace's catalogue against its rights records (Brief §10, §11),
 * store the results, open a case for anything flagged, and tell the team.
 *
 * - **Who is scanned** is the watchlist (`modules/creators`): creators not
 *   removed and not paused, oldest first, up to the plan's limit (§19) —
 *   any beyond it are left out and counted, not silently dropped.
 * - **What is assessed** is the catalogue (`modules/catalog`): a song
 *   outside it is recorded, not assessed, so adding it later brings its
 *   posts in (`reassess.ts`).
 * - **Which window**: everything since the creator was last reached (with
 *   a day's overlap, so a post published while the last scan ran isn't
 *   missed), or the last 30 days for a creator never scanned. In demo mode
 *   every scan covers the whole demo window — from the start of the demo
 *   dataset's scenarios — so a song added since the last scan is found in
 *   the posts that scan already checked, the way a real provider's stored
 *   identifications would find it.
 * - **Every run is a `Job`** (§21), created when it starts and completed
 *   or failed when it ends, with per-creator results as its payload — what
 *   a creator's monitoring history (§8) and "last scan" (§7) read.
 *
 * Until the real TikTok connector exists (`connector-mode.ts`), the
 * connector and music identification are the demo dataset's. Swapping in
 * the real ones changes nothing below.
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
  triggeredByUserId: string | null,
  options: {
    /** Run as this job from the queue (`scan-queue.ts`) instead of creating
     *  one. The worker marks it completed or failed afterwards. */
    queuedJobId?: string;
  } = {},
): Promise<RunWorkspaceScanResult> {
  const allowance = await getCreatorAllowance(workspaceId);
  if (allowance.cap <= 0) return { ok: false, error: "NO_PLAN" };

  const creatorRepository = getCreatorStore().creators;
  const monitored = (await creatorRepository.findForWorkspace(workspaceId)).filter((c) => c.monitoringEnabled);
  if (monitored.length === 0) return { ok: false, error: "NO_CREATORS" };
  const creators = monitored.slice(0, allowance.cap);

  const workspace = await getAuthStore().workspaces.findById(workspaceId);
  if (!workspace) throw new Error("Workspace not found.");
  const connectorMode = dataModeFor(workspace);
  const jobs = getJobStore().jobs;
  const startedAt = new Date();
  const payload = emptyScanPayload({
    triggeredByUserId,
    connectorMode,
    creatorsTotal: creators.length,
    skippedOverLimit: monitored.length - creators.length,
  });

  if (options.queuedJobId) {
    // Errors go up to the worker, which decides between retrying and failing.
    await jobs.update<ScanJobPayload>(options.queuedJobId, { payload });
    const final = await scanCreators(workspaceId, triggeredByUserId, creators, startedAt, payload, connectorMode);
    return { ok: true, job: await jobs.update<ScanJobPayload>(options.queuedJobId, { payload: final }) };
  }

  const job = await jobs.create<ScanJobPayload>({
    workspaceId,
    type: SCAN_JOB_TYPE,
    status: "RUNNING",
    attempts: 1,
    startedAt,
    payload,
  });

  try {
    const final = await scanCreators(workspaceId, triggeredByUserId, creators, startedAt, payload, connectorMode);
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
  triggeredByUserId: string | null,
  creators: CreatorRecord[],
  now: Date,
  payload: ScanJobPayload,
  mode: ConnectorMode,
): Promise<ScanJobPayload> {
  const library = getLibraryStore();
  const catalogue = await library.catalog.findCatalogue(workspaceId);
  const { connector, musicProvider } = scanProviders(
    mode,
    catalogue.map((track) => ({ trackId: track.id, title: track.title, artist: track.artist, isrc: track.isrc })),
  );
  const campaigns = new PrismaCampaignRepository(workspaceId);
  const results = getScanResultStore().results;
  const creatorRepository = getCreatorStore().creators;

  // Each song's records are read once per scan, however many posts use it.
  const rightsByTrack = new Map<string, Promise<RightsRecordInput[]>>();
  const getRightsRecordsForTrack = (trackId: string) => {
    if (!rightsByTrack.has(trackId)) {
      rightsByTrack.set(
        trackId,
        library.rights.findForTrack(workspaceId, trackId).then((rows) => rows.map(toRightsRecordInput)),
      );
    }
    return rightsByTrack.get(trackId)!;
  };

  // Fetch: one creator at a time — a real connector is rate-limited, and
  // one failing creator mustn't stop the rest (Brief §37).
  const items: ScanItemInput[] = [];
  const perCreator: ScanJobCreatorResult[] = [];
  for (const creator of creators) {
    const result = await runScan({
      connector,
      musicProvider,
      getRightsRecordsForTrack,
      getCampaignIdsForCreator: async (creatorExternalId) =>
        (await campaigns.findForCreator(creatorExternalId)).map((c) => c.id),
      findCatalogueTrack: async (match) =>
        findSameTrack(catalogue, { isrc: match.isrc, title: match.title, artist: match.artist || null })?.id ?? null,
      creatorExternalId: creator.externalId,
      creatorUsername: creator.handle,
      creatorCountry: creator.country,
      since: windowStart(creator, now, mode),
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

/**
 * The connector and music identification for a scan. Demo: the demo
 * dataset's, for both. Real: TikTok's Commercial Content API, and no music
 * recognition until a provider is connected, so posts are stored as "no
 * song identified" rather than given an invented one.
 */
function scanProviders(
  mode: ConnectorMode,
  catalogue: { trackId: string; title: string; artist: string | null; isrc: string | null }[],
): { connector: PlatformConnector; musicProvider: MusicIdentificationProvider } {
  const credentials = mode === "REAL" ? getTikTokCredentials() : null;
  if (mode === "REAL" && !credentials) throw new Error("TikTok credentials are missing.");
  if (credentials) {
    return { connector: new TikTokCommercialContentConnector(credentials), musicProvider: getRecognitionProvider() };
  }
  return { connector: new MockTikTokConnector(), musicProvider: new FixtureMusicIdentificationProvider({ catalogue }) };
}

function windowStart(creator: CreatorRecord, now: Date, mode: ConnectorMode): Date {
  const lookback = new Date(now.getTime() - INITIAL_LOOKBACK_DAYS * DAY_MS);
  if (mode === "DEMO") return DEMO_WINDOW_START < lookback ? DEMO_WINDOW_START : lookback;
  if (creator.lastSeenAt) return new Date(creator.lastSeenAt.getTime() - DAY_MS);
  return lookback;
}
