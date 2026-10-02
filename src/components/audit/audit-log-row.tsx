import Link from "next/link";
import type { AuditLogEntryView } from "./audit-log-view";

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * One row of the audit log table (`app/workspace/audit/page.tsx`). Takes
 * an already-resolved `AuditLogEntryView` rather than a raw `AuditLogRecord`
 * — every lookup that could need workspace data (member names, the related
 * case) already happened in `audit-log-view.ts`, so this component only
 * ever renders strings, the same division of labor `case-panel.tsx` uses
 * between fetching and its own markup.
 *
 * A table row, not a whole-row `<Link>` the way `NotificationRow` is: a
 * `<tr>` can't itself be an anchor, and an audit trail's "when / who /
 * what" shape reads better as a scannable table than as a list of cards.
 */
export function AuditLogRow({ entry }: { entry: AuditLogEntryView }) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-5 py-3.5 align-top whitespace-nowrap text-t2">
        {dateTimeFormatter.format(entry.createdAt)}
      </td>
      <td className="px-5 py-3.5 align-top text-tx">{entry.actorLabel}</td>
      <td className="px-5 py-3.5 align-top text-tx">
        {entry.description}
        {entry.href && (
          <>
            {" "}
            <Link href={entry.href} className="text-accent underline underline-offset-2">
              {entry.hrefLabel}
            </Link>
          </>
        )}
      </td>
    </tr>
  );
}
