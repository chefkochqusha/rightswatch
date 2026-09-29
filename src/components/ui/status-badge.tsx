import type { RightsAssessmentStatus } from "@/modules/rights-engine/types";
import { STATUS_LABELS } from "@/components/rights/labels";

const STYLES: Record<RightsAssessmentStatus, string> = {
  CLEARED: "bg-cleared-bg text-cleared",
  REVIEW: "bg-review-bg text-review",
  POTENTIAL_MISMATCH: "bg-mismatch-bg text-mismatch",
  UNKNOWN: "bg-unknown-bg text-unknown",
};

export function StatusBadge({ status }: { status: RightsAssessmentStatus }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}
