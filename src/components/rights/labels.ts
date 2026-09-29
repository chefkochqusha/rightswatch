import type {
  RightsAssessmentReason,
  RightsAssessmentStatus,
} from "@/modules/rights-engine/types";

/**
 * UI-safe copy for the engine's statuses and reason codes (Brief §11). Kept
 * separate from the engine itself so the pure `rights-engine` module never
 * needs to know anything about display strings, and so every page that
 * shows an assessment (this dashboard, later a Case detail view) uses
 * identical wording.
 */
export const STATUS_LABELS: Record<RightsAssessmentStatus, string> = {
  CLEARED: "Cleared",
  REVIEW: "Needs review",
  POTENTIAL_MISMATCH: "Potential mismatch",
  UNKNOWN: "Unknown",
};

export const REASON_LABELS: Record<RightsAssessmentReason, string> = {
  NO_RIGHTS_RECORD: "No rights record on file",
  TERM_EXPIRED: "Term does not cover this date",
  TERRITORY_NOT_COVERED: "Territory not covered",
  USAGE_TYPE_NOT_COVERED: "Usage type not covered",
  COMMERCIAL_USAGE_NOT_COVERED: "Commercial usage not covered",
  CAMPAIGN_NOT_COVERED: "Campaign not covered",
  CONFLICTING_RIGHTS_RECORDS: "Conflicting rights records",
  MANUAL_REVIEW_REQUIRED: "Manual review required",
};

/**
 * Worst-first ranking for tables that list assessments across many
 * creators — the whole point of the product is surfacing what needs a
 * human look before what's already fine. Shared by the Demo Mode dashboard
 * and the real workspace's sample-scan table so the two never rank
 * statuses differently.
 */
export const STATUS_SORT_ORDER: Record<RightsAssessmentStatus, number> = {
  POTENTIAL_MISMATCH: 0,
  REVIEW: 1,
  UNKNOWN: 2,
  CLEARED: 3,
};
