import { runScan } from './run-scan';
import type { ScanItemResult } from './types';
import { MockTikTokConnector } from '../connectors/tiktok/mock-connector';
import { FixtureMusicIdentificationProvider } from '../music/fixture-provider';
import { FixtureRightsRepository } from '../rights/fixture-repository';
import { FixtureCampaignRepository } from '../campaigns/fixture-repository';
import {
  DEMO_AS_OF,
  DEMO_CREATORS,
  DEMO_NEW_SINCE,
  DEMO_WINDOW_START,
  type DemoCreatorProfile,
} from '../demo-data';

export type DemoSnapshotItem = ScanItemResult & { creator: DemoCreatorProfile };

export interface DemoSnapshot {
  items: DemoSnapshotItem[];
  /** Brief §48's headline numbers, computed rather than written down. */
  counts: {
    monitoredCreators: number;
    videos: number;
    musicMatches: number;
    /** Assessed items a case would open for: anything not CLEARED. */
    openCases: number;
    newMatches: number;
  };
}

/**
 * One demo scan of all 48 demo creators over Demo Mode's fixed window
 * (`DEMO_WINDOW_START` → `DEMO_AS_OF`), through the real `runScan()` —
 * the same pipeline, engine and fixture adapters a workspace's demo scan
 * uses, with the clock pinned to the end of the window so the result never
 * changes. `salt` exists for `scripts/demo-data/find-salt.ts`.
 */
export async function computeDemoSnapshot(salt?: string): Promise<DemoSnapshot> {
  const connector = new MockTikTokConnector({ now: () => DEMO_AS_OF, salt });
  const musicProvider = new FixtureMusicIdentificationProvider({ salt });
  const rights = new FixtureRightsRepository();
  const campaigns = new FixtureCampaignRepository();

  const items: DemoSnapshotItem[] = [];
  for (const creator of DEMO_CREATORS) {
    const result = await runScan({
      connector,
      musicProvider,
      getRightsRecordsForTrack: (trackId) => rights.getRecordsForTrack(trackId),
      getCampaignIdsForCreator: async (id) => (await campaigns.findForCreator(id)).map((c) => c.id),
      creatorExternalId: creator.handle,
      creatorUsername: creator.handle,
      creatorCountry: creator.country,
      since: DEMO_WINDOW_START,
      until: DEMO_AS_OF,
    });
    for (const item of result.items) items.push({ ...item, creator });
  }

  const assessed = items.filter((item) => item.kind === 'ASSESSED');
  return {
    items,
    counts: {
      monitoredCreators: DEMO_CREATORS.length,
      videos: items.length,
      musicMatches: assessed.length,
      openCases: assessed.filter((item) => item.assessment.status !== 'CLEARED').length,
      newMatches: assessed.filter((item) => item.content.publishedAt >= DEMO_NEW_SINCE).length,
    },
  };
}
