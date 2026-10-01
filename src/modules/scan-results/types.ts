import type { ScanItemResult } from "../scan-pipeline/types";

/**
 * Persisted scan results (Master Brief §22, §43, §50) — the durable form
 * of `runScan()`'s output for one workspace:
 *
 *   Creator → Content → CommercialContent → MusicMatch (→ MusicTrack)
 *                                             → RightsAssessment → (Case)
 *
 * `runScan()` itself stays side-effect-free (see `scan-pipeline/types.ts`);
 * this is the persistence step its doc comment leaves to the caller,
 * including deduplication (§50's step 6, on §22's stable external ids).
 *
 * Why it exists now: the sample scan used to keep its items in one server
 * process's memory, which on Vercel meant they vanished on every redeploy
 * or instance recycle — while the notifications and audit entries pointing
 * at them (Postgres) stayed, and linked to 404s. And a `Case` can only be
 * stored in Postgres once there's a real `RightsAssessment` row for its
 * foreign key to point at (see `app/_lib/case-store.ts`).
 */

interface CreatorContext {
  /** The watchlist creator (`Creator.id`) the item was found for. */
  creatorId: string;
  creatorExternalId: string;
  creatorUsername: string;
}

/** One `runScan()` item plus the creator it was found for — what a scan
 *  hands to `saveScan`. The creator already exists: a scan only fetches
 *  creators on the watchlist (`modules/creators`), and never adds one. */
export type ScanItemInput = ScanItemResult & CreatorContext;

/**
 * One item as stored and read back: the same shape the pages already
 * render, plus — for an `ASSESSED` item, and only for one — the id of its
 * persisted `RightsAssessment` row, which is what a `Case` points at.
 * Discriminated on `kind`, so narrowing to `ASSESSED` also narrows
 * `rightsAssessmentId` to a string.
 */
export type StoredScanItem =
  | (Extract<ScanItemResult, { kind: "ASSESSED" }> & CreatorContext & { rightsAssessmentId: string })
  | (Exclude<ScanItemResult, { kind: "ASSESSED" }> & CreatorContext & { rightsAssessmentId: null });

/**
 * The one piece of a scan result the schema has nowhere to keep: a music
 * provider's error text. A failed identification is transient — the next
 * scan retries it — so what's stored is the fact that no identification
 * completed (no `MusicMatch` row at all), and this is how that fact reads
 * back.
 */
export const IDENTIFICATION_NOT_COMPLETED =
  "Music identification didn't complete for this item. Running the scan again retries it.";

export interface ScanResultRepository {
  /**
   * Writes every item's chain, idempotently on the schema's own keys (Brief
   * §22): saving the same scan again updates the same rows in place and
   * never duplicates one, so a re-run keeps every `rightsAssessmentId` — and
   * therefore every open Case — attached. Nothing is ever deleted: a later
   * scan that fails to identify a track, or finds none, never erases an
   * earlier identification (and the Case hanging off it). Returns each
   * item's stored form, in input order.
   */
  saveScan(input: {
    workspaceId: string;
    /** `MusicIdentificationProvider.providerName` — recorded on a "no track
     *  found" result, which has no match of its own to carry it. */
    musicProviderName: string;
    items: ScanItemInput[];
  }): Promise<StoredScanItem[]>;

  /** Newest first. */
  findForWorkspace(workspaceId: string): Promise<StoredScanItem[]>;

  /** One creator's items, newest first. Scoped by workspace. */
  findForCreator(workspaceId: string, creatorId: string): Promise<StoredScanItem[]>;

  /** Scoped by workspace: another workspace's item with the same platform
   *  id is never returned. */
  findByContentId(workspaceId: string, externalContentId: string): Promise<StoredScanItem | null>;
}
