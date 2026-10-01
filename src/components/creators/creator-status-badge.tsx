import type { CreatorStatus } from "@/modules/creators";
import { AlertIcon, CheckIcon, ClockIcon, PauseIcon } from "@/components/ui/icons";
import { CREATOR_STATUS_DESCRIPTIONS, CREATOR_STATUS_LABELS } from "./labels";

/** Icon, label and color (Brief §30) for a creator's monitoring status. */
const STYLES: Record<CreatorStatus, { tone: string; Icon: typeof CheckIcon }> = {
  ACTIVE: { tone: "bg-cleared-bg text-cleared", Icon: CheckIcon },
  PENDING: { tone: "bg-review-bg text-review", Icon: ClockIcon },
  PAUSED: { tone: "bg-hover text-t2", Icon: PauseIcon },
  ERROR: { tone: "bg-mismatch-bg text-mismatch", Icon: AlertIcon },
};

export function CreatorStatusBadge({ status }: { status: CreatorStatus }) {
  const { tone, Icon } = STYLES[status];
  return (
    <span
      title={CREATOR_STATUS_DESCRIPTIONS[status]}
      className={`inline-flex w-fit items-center gap-1 rounded-full py-1 pr-2.5 pl-2 text-xs font-medium whitespace-nowrap ${tone}`}
    >
      <Icon className="h-3 w-3" />
      {CREATOR_STATUS_LABELS[status]}
    </span>
  );
}
