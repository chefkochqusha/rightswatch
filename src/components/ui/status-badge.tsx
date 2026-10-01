import type { RightsAssessmentStatus } from "@/modules/rights-engine/types";
import { STATUS_LABELS } from "@/components/rights/labels";
import { AlertIcon, CheckIcon, EyeIcon, QuestionIcon } from "@/components/ui/icons";

/** A rights verdict as icon, label and color — never color alone (Brief §30). */
const STYLES: Record<RightsAssessmentStatus, { tone: string; Icon: typeof CheckIcon }> = {
  CLEARED: { tone: "bg-cleared-bg text-cleared", Icon: CheckIcon },
  REVIEW: { tone: "bg-review-bg text-review", Icon: EyeIcon },
  POTENTIAL_MISMATCH: { tone: "bg-mismatch-bg text-mismatch", Icon: AlertIcon },
  UNKNOWN: { tone: "bg-unknown-bg text-unknown", Icon: QuestionIcon },
};

export function StatusBadge({ status }: { status: RightsAssessmentStatus }) {
  const { tone, Icon } = STYLES[status];
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded-full py-1 pr-2.5 pl-2 text-xs font-medium whitespace-nowrap ${tone}`}
    >
      <Icon className="h-3 w-3" />
      {STATUS_LABELS[status]}
    </span>
  );
}
