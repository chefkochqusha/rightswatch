import type { SubscriptionStatus } from "@/modules/billing";
import { SUBSCRIPTION_STATUS_LABELS } from "./labels";

const STYLES: Record<SubscriptionStatus, string> = {
  TRIALING: "bg-review-bg text-review",
  ACTIVE: "bg-cleared-bg text-cleared",
  PAST_DUE: "bg-mismatch-bg text-mismatch",
  CANCELED: "bg-hover text-t2",
};

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${STYLES[status]}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {SUBSCRIPTION_STATUS_LABELS[status]}
    </span>
  );
}
