import Link from "next/link";
import type { NotificationRecord } from "@/modules/notifications";
import type { RightsAssessmentStatus } from "@/modules/rights-engine/types";
import { StatusBadge } from "@/components/ui/status-badge";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Renders one notification, switching on `type` — today there's only
 * `CASE_OPENED`, but the `switch` (not an `if`) is deliberate so TypeScript
 * flags this file the moment a second `NotificationType` is added elsewhere
 * and forgets to teach this component about it.
 *
 * `payload.status` is a plain `string` on the wire (`modules/notifications`
 * stays decoupled from `rights-engine`, same as `modules/cases` — see that
 * module's `types.ts`), so it's cast back to `RightsAssessmentStatus` here,
 * at the one place that actually renders it. Safe because the one producer
 * (`workspace-scan-store.ts`) only ever writes a real
 * `RightsAssessmentResult.status` into it.
 */
export function NotificationRow({ notification }: { notification: NotificationRecord }) {
  switch (notification.type) {
    case "CASE_OPENED":
      return (
        <Link
          href={`/workspace/items/${encodeURIComponent(notification.payload.contentId)}`}
          className={`flex items-center justify-between gap-4 px-5 py-4 hover:bg-hover ${
            notification.read ? "" : "bg-review-bg/40"
          }`}
        >
          <div className="flex items-center gap-3">
            {!notification.read && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-review"
                aria-label="Unread"
              />
            )}
            <div>
              <p className="text-[0.8125rem] text-tx">
                New case opened for{" "}
                <span className="font-medium">@{notification.payload.creatorUsername}</span>
              </p>
              <p className="mt-0.5 text-[0.75rem] text-t2">
                {dateTimeFormatter.format(notification.createdAt)}
              </p>
            </div>
          </div>
          <StatusBadge status={notification.payload.status as RightsAssessmentStatus} />
        </Link>
      );
    default: {
      // Exhaustiveness guard — TypeScript errors on this line the moment a
      // NotificationType is added elsewhere without a matching case above,
      // since `notification.type` would no longer narrow to `never` here.
      const _exhaustive: never = notification.type;
      return null;
    }
  }
}
