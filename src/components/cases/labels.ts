import type { CaseStatus } from "@/modules/cases";

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
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  DISMISSED: "Dismissed",
};
