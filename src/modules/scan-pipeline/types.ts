import type { NormalizedCommercialContent, PlatformConnector } from '../connectors/types';
import type { MusicIdentificationProvider, NormalizedMusicMatch } from '../music/types';
import type { RightsAssessmentResult, RightsRecordInput } from '../rights-engine/types';

/**
 * Scan pipeline (Master Brief §8, §21–§23).
 *
 * `runScan()` wires the three adapter boundaries together — connector,
 * music identification, rights engine — in the exact order the real
 * pipeline runs in production (Scheduler → Scan Job → TikTok Connector →
 * Normalize → Deduplicate → Music Identification → Rights Engine → Case
 * Creation → Notifications). This module stops one step short of "Case
 * Creation → Notifications": it produces the assessed results a caller
 * turns into Cases and Notifications, but doesn't write to a database or
 * send anything itself, so it stays usable from a demo script, a real
 * BullMQ job, or a test without any side effects of its own.
 *
 * Deduplication (Brief §22: a uniqueness strategy on stable external ids)
 * is a persistence-layer concern — upserts on the schema's unique keys,
 * done by `modules/scan-results` — and deliberately isn't reimplemented
 * here.
 */
export interface RunScanParams {
  connector: PlatformConnector;
  musicProvider: MusicIdentificationProvider;
  /** Reads on the "rights" domain module's repository interface — a real
   *  caller passes a Prisma-backed implementation, a demo passes the
   *  fixture one. Kept as a plain function type (not the class) so this
   *  module doesn't need to import anything from `modules/rights`. */
  getRightsRecordsForTrack: (trackId: string) => Promise<RightsRecordInput[]>;
  /** Ids of every campaign this creator currently belongs to (zero, one, or
   *  more — `Campaign.creators` is many-to-many in the schema). Same
   *  plain-function-type pattern as `getRightsRecordsForTrack`, so this
   *  module doesn't need to import anything from `modules/campaigns`
   *  either; see the call site in run-scan.ts for how this list is reduced
   *  to the single `campaignId` the Rights Engine's input expects. */
  getCampaignIdsForCreator: (creatorExternalId: string) => Promise<string[]>;
  creatorExternalId: string;
  creatorUsername: string;
  /** Inclusive publication-date window to scan. */
  since: Date;
  until: Date;
}

export type ScanItemResult =
  | {
      kind: 'NO_MUSIC_MATCH';
      content: NormalizedCommercialContent;
    }
  | {
      kind: 'MUSIC_ID_ERROR';
      content: NormalizedCommercialContent;
      error: string;
    }
  | {
      kind: 'ASSESSED';
      content: NormalizedCommercialContent;
      musicMatch: NormalizedMusicMatch;
      assessment: RightsAssessmentResult;
    };

export interface ScanResult {
  /** Set when the connector itself failed (auth, rate limit, network) —
   *  the caller should mark the Job FAILED/RETRYING (Brief §21) rather than
   *  read `items`, which will be empty. */
  connectorError: string | null;
  items: ScanItemResult[];
}
