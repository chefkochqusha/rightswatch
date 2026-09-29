import type { CaseStatus } from "@/modules/cases";
import { CASE_STATUS_LABELS } from "./labels";

/**
 * Reuses the same tone tokens `StatusBadge` (rights assessments) already
 * defines rather than inventing new color semantics: OPEN reads as
 * "needs attention" (review tone), IN_PROGRESS as active/neutral (unknown
 * tone), RESOLVED as a clean outcome (cleared tone), DISMISSED as inert
 * (the same muted pill used for "No track identified" elsewhere).
 */
const STYLES: Record<CaseStatus, string> = {
  OPEN: "bg-review-bg text-review",
  IN_PROGRESS: "bg-unknown-bg text-unknown",
  RESOLVED: "bg-cleared-bg text-cleared",
  DISMISSED: "bg-hover text-t2",
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {CASE_STATUS_LABELS[status]}
    </span>
  );
}
