import { runScan } from "@/modules/scan-pipeline";
import type { ScanItemResult } from "@/modules/scan-pipeline";
import { MockTikTokConnector } from "@/modules/connectors";
import { FixtureMusicIdentificationProvider } from "@/modules/music";
import { FixtureRightsRepository } from "@/modules/rights";
import { FixtureCampaignRepository } from "@/modules/campaigns";

/**
 * Demo Mode's shared data source for every page under `app/` (Brief §6):
 * runs the exact same `runScan()` pipeline a real background job will run
 * in production (Brief §8, §21), wired to the mock connector / fixture
 * music provider / fixture rights repository instead of TikTok, Prisma and
 * a real provider. Nothing on any page needs to know the difference —
 * swapping this one function's internals for real, DB-backed
 * implementations later is the only change required to turn a workspace
 * from Demo Mode into a live one.
 *
 * Private to `app/` (the `_lib` folder isn't routable) but shared across
 * route segments — deliberately not colocated under any single page's own
 * `_lib`, since the dashboard, the creators list and the assessment detail
 * page all read from it.
 */

const DEMO_CREATORS = [
  { creatorExternalId: "demo-creator-1", creatorUsername: "mia.dances" },
  { creatorExternalId: "demo-creator-2", creatorUsername: "leon.fit" },
  { creatorExternalId: "demo-creator-3", creatorUsername: "noah.cooks" },
  { creatorExternalId: "demo-creator-4", creatorUsername: "priya.beauty" },
] as const;

// Wide enough to include every fixture regardless of when "today" is.
const SINCE = new Date("2000-01-01");
const UNTIL = new Date("2100-01-01");

export interface DemoCreatorScan {
  creatorExternalId: string;
  creatorUsername: string;
  items: ScanItemResult[];
}

export async function getDemoScanResults(): Promise<DemoCreatorScan[]> {
  const connector = new MockTikTokConnector();
  const musicProvider = new FixtureMusicIdentificationProvider();
  const rightsRepository = new FixtureRightsRepository();
  const campaignRepository = new FixtureCampaignRepository();

  const scans = await Promise.all(
    DEMO_CREATORS.map(async (creator) => {
      const result = await runScan({
        connector,
        musicProvider,
        getRightsRecordsForTrack: (trackId) =>
          rightsRepository.getRecordsForTrack(trackId),
        getCampaignIdsForCreator: async (creatorExternalId) =>
          (await campaignRepository.findForCreator(creatorExternalId)).map((c) => c.id),
        creatorExternalId: creator.creatorExternalId,
        creatorUsername: creator.creatorUsername,
        since: SINCE,
        until: UNTIL,
      });
      return { ...creator, items: result.items };
    }),
  );

  return scans;
}

// An intersection, not `interface ... extends`, because ScanItemResult is a
// discriminated union — extending it directly isn't valid TypeScript, and
// an intersection distributes over the union so `row.kind === "ASSESSED"`
// still narrows the rest of the type correctly.
export type DemoAssessmentRow = ScanItemResult & {
  creatorExternalId: string;
  creatorUsername: string;
};

/** Flattens every creator's items into one list, each tagged with its
 *  creator — the shape every page below the top-level dashboard actually
 *  wants to render or search. */
export async function getAllDemoAssessments(): Promise<DemoAssessmentRow[]> {
  const scans = await getDemoScanResults();
  return scans.flatMap((scan) =>
    scan.items.map((item) => ({
      ...item,
      creatorExternalId: scan.creatorExternalId,
      creatorUsername: scan.creatorUsername,
    })),
  );
}

/** Looks up a single assessed item by its content id, for the assessment
 *  detail page. Demo Mode has no database to query, so this just scans the
 *  small fixed fixture set — a real implementation queries `CommercialContent`
 *  and `RightsAssessment` by id instead. */
export async function getDemoAssessmentByContentId(
  contentId: string,
): Promise<DemoAssessmentRow | null> {
  const all = await getAllDemoAssessments();
  return all.find((row) => row.content.externalContentId === contentId) ?? null;
}
