/**
 * Rights Engine — types (Master Brief §11, §43).
 *
 * These types are intentionally NOT the Prisma models. The engine takes a
 * small, flat, plain-data input shape that a caller (a scan-pipeline step,
 * an API route, a test) builds from whatever ORM rows it has. That keeps
 * `assessRights()` pure and framework-free: no Prisma import anywhere in
 * this module, so it can be unit-tested with zero database and reused from
 * anywhere (a web request, a background job, a one-off script) unchanged.
 */

/** The engine's verdict. Never a legal conclusion — always a signal for a
 *  human (ANALYST/ADMIN) to act on inside a Case (Brief §11, §16). */
export type RightsAssessmentStatus =
  | 'CLEARED'
  | 'REVIEW'
  | 'POTENTIAL_MISMATCH'
  | 'UNKNOWN';

/** The 8 reason codes from Master Brief §11. Present whenever status is not
 *  CLEARED; `null` for CLEARED (a clean pass has nothing to explain away). */
export type RightsAssessmentReason =
  | 'NO_RIGHTS_RECORD'
  | 'TERM_EXPIRED'
  | 'TERRITORY_NOT_COVERED'
  | 'USAGE_TYPE_NOT_COVERED'
  | 'COMMERCIAL_USAGE_NOT_COVERED'
  | 'CAMPAIGN_NOT_COVERED'
  | 'CONFLICTING_RIGHTS_RECORDS'
  | 'MANUAL_REVIEW_REQUIRED';

/**
 * One RightsRecord (Brief §43), reduced to only the fields assessRights()
 * reads. Mirrors the `RightsRecord` Prisma model's semantics field-for-field
 * — mapping a row to this shape at the call site should never need any
 * business logic of its own.
 */
export interface RightsRecordInput {
  id: string;
  /** ISO 3166-1 alpha-2 codes this grant covers. Empty array = worldwide. */
  territories: string[];
  /** Does this grant cover commercial (paid-partnership / #ad) usage? */
  commercialUsageAllowed: boolean;
  /** Does this grant cover organic (unpaid) usage? */
  organicUsageAllowed: boolean;
  /** Grant window start (inclusive). */
  startDate: Date;
  /** Grant window end (inclusive). `null` = open-ended. */
  endDate: Date | null;
  /** Campaign ids this record is scoped to. Empty array = every campaign
   *  (Brief §11 lists Campaign as an input and CAMPAIGN_NOT_COVERED as a
   *  reason code — this is the field that check reads). */
  campaignIds: string[];
}

export interface RightsAssessmentInput {
  /** The piece of commercial content being assessed, reduced to what the
   *  engine needs from CommercialContent + its MusicMatch (Brief §43). */
  content: {
    /** When the content was published, per the platform. Term coverage is
     *  checked against this date, not against "now" — the question is
     *  always "was this use covered on the day it happened," which keeps
     *  the function pure (no clock read) and correct to re-run later. */
    publishedAt: Date;
    /** ISO 3166-1 alpha-2 territory to evaluate against. `null` when the
     *  platform/connector couldn't determine one (TikTok's Commercial
     *  Content API doesn't return one today — Brief §4, so this will be
     *  `null` for most real content right now). A worldwide-scoped rights
     *  record still clears normally despite an unknown territory; only a
     *  territory-*restricted* record that would need this value to decide
     *  routes the result to UNKNOWN — the engine never silently guesses
     *  "worldwide" or a default market for a record that says otherwise. */
    territory: string | null;
    /** Where `territory` came from, for the explanation only — it never
     *  changes the verdict. `"content"` (the default): the platform reported
     *  it for this post. `"creator"`: the post carried none, so it's the
     *  country recorded for the creator (Brief §8, §11 "Country") — a
     *  weaker signal, and the explanation says so. */
    territorySource?: 'content' | 'creator';
    /** True for paid-partnership / #ad usage, false for organic. Every
     *  TikTok Commercial Content API result is commercial by definition
     *  (that's the whole product), so this is always `true` in production
     *  today — kept explicit so a future organic-monitoring connector
     *  (Brief §1: FutureInstagramConnector etc.) isn't silently misassessed
     *  by an engine that secretly assumed "commercial" everywhere. */
    isCommercialUsage: boolean;
    /** The campaign this content was tagged as belonging to, if known. Same
     *  unknown-vs-not-covered nuance as `territory` above: a
     *  campaign-unrestricted record clears regardless, only a
     *  campaign-*scoped* record that would need this value routes to
     *  UNKNOWN when it's missing. */
    campaignId: string | null;
  };
  /** Every RightsRecord on file for the track this content was matched to.
   *  Empty array means literally no rights record exists for that track. */
  rightsRecords: RightsRecordInput[];
  /** An ANALYST/ADMIN's manual call on this exact case, if one has already
   *  been made. Always wins immediately and unconditionally — per Brief
   *  §11 ("Never make the rights engine produce legal conclusions"), a
   *  human's decision outranks every computed one. */
  manualOverride?: {
    status: RightsAssessmentStatus;
    note: string;
  };
}

export interface RightsAssessmentResult {
  status: RightsAssessmentStatus;
  /** `null` only when status is CLEARED. */
  reason: RightsAssessmentReason | null;
  /** The RightsRecord id(s) the decision was based on — the records that
   *  were "in scope" at whichever check produced the verdict, for display
   *  and audit in the Case UI. Empty only when status is UNKNOWN or the
   *  reason is NO_RIGHTS_RECORD (nothing existed to point at). */
  matchedRecordIds: string[];
  /** Short, human-readable, UI-safe explanation of the verdict. Never a
   *  legal conclusion — describes what the data shows, not what it means
   *  legally. */
  explanation: string;
}
