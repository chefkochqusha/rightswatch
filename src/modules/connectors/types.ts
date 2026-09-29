/**
 * Connector architecture (Master Brief §1–§5, §9, §44).
 *
 * A connector is the ONLY code in the system allowed to know a given
 * platform's raw API shape. Everything downstream — music identification,
 * the rights engine, cases, the UI — reads exclusively from the
 * `NormalizedCommercialContent` shape defined here. That boundary is what
 * lets a future FutureInstagramConnector or FutureYouTubeConnector slot in
 * without touching a single line of business logic, and it's why
 * `rawPayload` below exists only for audit display, never for a business
 * rule to branch on.
 */

/** Matches the Prisma `Platform` enum (Brief §43). Kept as a plain string
 *  union here (not a Prisma import) so this module has zero dependency on
 *  the database layer. */
export type Platform = 'TIKTOK' | 'INSTAGRAM' | 'YOUTUBE';

/**
 * The normalized shape every connector must produce. Field names are
 * deliberately generic (not TikTok's `create_timestamp` / `brand_names`
 * verbatim) so a second platform's adapter maps onto the identical shape.
 */
export interface NormalizedCommercialContent {
  platform: Platform;
  /** The id the platform assigns to this piece of content. Combined with
   *  `platform`, this is the idempotency key used at ingestion (Brief §23:
   *  "platform + external_content_id") — a re-run of the same scan must
   *  resolve to the same Content/CommercialContent row, not a duplicate. */
  externalContentId: string;
  creatorExternalId: string;
  creatorUsername: string;
  publishedAt: Date;
  /** Brand/label names as disclosed by the platform's commercial-content
   *  flag, e.g. TikTok's `brand_names` (Brief §4). */
  brandNames: string[];
  /** The platform's own disclosure label, e.g. TikTok's `label` field
   *  ("Paid partnership"). `null` when the platform doesn't provide one. */
  label: string | null;
  /** Public URL(s) of the actual video/post, for a human to open in the
   *  Case UI and for a MusicIdentificationProvider to fingerprint — the
   *  one piece of `rawPayload` worth promoting to a normalized field,
   *  since "where is the video" is a platform-agnostic concept, not a
   *  TikTok-specific one. */
  videoUrls: string[];
  /** Best-effort territory for the content, if the connector/API can
   *  determine one. TikTok's Commercial Content API does not return this
   *  today (Brief §4) — real connectors leave it `null` rather than
   *  guessing; the rights engine treats `null` as UNKNOWN, never as
   *  "worldwide" (Brief §11). */
  territory: string | null;
  /** The unmodified API response. Kept for audit/debugging display only —
   *  no business logic anywhere may read this field (Brief §1, §44). */
  rawPayload: unknown;
}

/** What a connector needs to run one fetch. TikTok's real Commercial
 *  Content API takes exactly a creator username plus a publication-date
 *  range (Brief §4) — this shape generalizes that across platforms. */
export interface ConnectorFetchParams {
  creatorExternalId: string;
  creatorUsername: string;
  /** Inclusive publication-date window to search. */
  since: Date;
  until: Date;
}

export interface ConnectorFetchResult {
  items: NormalizedCommercialContent[];
  /** Non-null when the fetch could not complete (auth failure, rate limit,
   *  network error). The caller must mark the Job FAILED/RETRYING (Brief
   *  §21) rather than treat this the same as "zero items found." */
  error: string | null;
}

/**
 * The contract every platform adapter implements (Brief §1):
 * TikTokCommercialContentConnector, TikTokResearchConnector, a mock used in
 * Demo Mode, and eventually FutureInstagramConnector /
 * FutureYouTubeConnector are all interchangeable behind this interface.
 */
export interface PlatformConnector {
  readonly platform: Platform;
  fetchCommercialContent(
    params: ConnectorFetchParams,
  ): Promise<ConnectorFetchResult>;
}
