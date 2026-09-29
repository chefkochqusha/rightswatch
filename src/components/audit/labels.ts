import type { CaseStatus } from "@/modules/cases";
import { CASE_STATUS_LABELS } from "@/components/cases/labels";

/**
 * UI-safe copy for audit-log `action` strings. Deliberately a
 * `Partial<Record<string, string>>`, not indexed by a closed union like
 * `CASE_STATUS_LABELS` is: `modules/audit`'s `action` field is a plain,
 * open `string` by design (see that module's own `types.ts` doc comment) —
 * any future caller can start writing its own action strings without the
 * audit module changing at all, so this file can only describe the ones
 * that exist today and must fall back gracefully for anything else, never
 * assume a closed set.
 */
const AUDIT_ACTION_LABELS: Partial<Record<string, string>> = {
  "case.opened": "Opened a case",
  "case.status_changed": "Changed the case status",
  "case.assignee_changed": "Changed the case assignment",
};

/** Falls back to the raw action string itself — still renders something
 *  sensible for an action this file hasn't been taught about yet. */
export function getAuditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/**
 * Same open-ended fallback, for a status value read out of an audit
 * entry's `metadata` — which is `Record<string, unknown> | null`, so by
 * the time a value reaches here it's already been narrowed to `string` but
 * never guaranteed to be a real `CaseStatus`. Checks real membership
 * before casting, rather than casting blind the way a producer-guaranteed
 * value (like `notification-row.tsx`'s `status`) safely can.
 */
export function getCaseStatusLabelOrRaw(status: string): string {
  return status in CASE_STATUS_LABELS ? CASE_STATUS_LABELS[status as CaseStatus] : status;
}
