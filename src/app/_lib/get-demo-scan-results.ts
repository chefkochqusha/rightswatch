import { computeDemoSnapshot, type DemoSnapshot, type DemoSnapshotItem } from "@/modules/scan-pipeline/demo-snapshot";
import { DEMO_CREATORS, type DemoCreatorProfile } from "@/modules/demo-data";
import type { ScanItemResult } from "@/modules/scan-pipeline";

/**
 * Demo Mode's shared data source for the public pages (`/dashboard`,
 * `/creators`, `/assessments/*`): one demo scan of the 48 demo creators
 * over a fixed window (`modules/scan-pipeline/demo-snapshot.ts`), through
 * the same `runScan()` pipeline a workspace's scans use. Nothing is stored;
 * it's recomputed per request, and always comes out the same.
 *
 * Private to `app/` (the `_lib` folder isn't routable) but shared across
 * route segments, since all three pages read from it.
 */

export type { DemoSnapshot };

export async function getDemoSnapshot(): Promise<DemoSnapshot> {
  return computeDemoSnapshot();
}

export interface DemoCreatorScan {
  creator: DemoCreatorProfile;
  items: ScanItemResult[];
}

/** Every demo creator with what the snapshot found for them — including
 *  the ones who posted nothing commercial in the window. */
export async function getDemoScanResults(): Promise<DemoCreatorScan[]> {
  const { items } = await getDemoSnapshot();
  return DEMO_CREATORS.map((creator) => ({
    creator,
    items: items.filter((item) => item.creator.handle === creator.handle),
  }));
}

export type DemoAssessmentRow = DemoSnapshotItem;

/** One scanned item by its content id, for the assessment detail page. */
export async function getDemoAssessmentByContentId(contentId: string): Promise<DemoAssessmentRow | null> {
  const { items } = await getDemoSnapshot();
  return items.find((row) => row.content.externalContentId === contentId) ?? null;
}
