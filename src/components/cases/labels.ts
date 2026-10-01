import type { CasePriority, CaseStatus } from "@/modules/cases";

/**
 * UI-safe copy for `CaseStatus` — kept separate from `modules/cases` for
 * the same reason `components/rights/labels.ts` is kept separate from
 * `modules/rights-engine`: the domain module never needs to know anything
 * about display strings, and every page that shows a case (today, just the
 * workspace item detail page and the workspace scan table) uses identical
 * wording.
 */
export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In review",
  WAITING: "Waiting",
  CLEARED: "Cleared",
  RESOLVED: "Resolved",
  DISMISSED: "Dismissed",
};

export const CASE_PRIORITY_LABELS: Record<CasePriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

/** What each status means, for the case's status picker. */
export const CASE_STATUS_HINTS: Record<CaseStatus, string> = {
  OPEN: "Nobody has looked at it yet.",
  IN_PROGRESS: "Someone on the team is looking into it.",
  WAITING: "Waiting for someone outside the team.",
  CLEARED: "Looked at: nothing is wrong.",
  RESOLVED: "Acted on and finished.",
  DISMISSED: "Not worth pursuing.",
};
