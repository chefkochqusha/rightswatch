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
  "case.priority_changed": "Changed the case priority",
  "report.exported": "Exported a report",
  "creator.added": "Added a creator to the watchlist",
  "creator.restored": "Put a creator back on the watchlist",
  "creator.paused": "Paused monitoring of a creator",
  "creator.resumed": "Resumed monitoring of a creator",
  "creator.removed": "Removed a creator from the watchlist",
  "creator.updated": "Updated a creator's details",
  "post.song_identified": "Identified the song in a post",
  "song.added": "Added a song to the catalogue",
  "song.removed": "Took a song out of the catalogue",
  "song.updated": "Updated a song's catalogue details",
  "rights.added": "Added a rights record",
  "rights.updated": "Changed a rights record",
  "rights.removed": "Deleted a rights record",
  "account.password_changed": "Changed a password",
  "team.invited": "Invited a teammate",
  "billing.plan_chosen": "Chose a plan",
  "billing.canceled": "Cancelled the subscription",
  "data.exported": "Downloaded workspace data",
};

/** The same actions, naming the creator — when the entry recorded who. */
const CREATOR_ACTION_TEMPLATES: Partial<Record<string, (handle: string) => string>> = {
  "creator.added": (handle) => `Added @${handle} to the watchlist`,
  "creator.restored": (handle) => `Put @${handle} back on the watchlist`,
  "creator.paused": (handle) => `Paused monitoring of @${handle}`,
  "creator.resumed": (handle) => `Resumed monitoring of @${handle}`,
  "creator.removed": (handle) => `Removed @${handle} from the watchlist`,
  "creator.updated": (handle) => `Updated @${handle}'s details`,
};

/** The same actions, naming the song — when the entry recorded its title. */
const SONG_ACTION_TEMPLATES: Partial<Record<string, (title: string) => string>> = {
  "song.added": (title) => `Added “${title}” to the catalogue`,
  "song.removed": (title) => `Took “${title}” out of the catalogue`,
  "song.updated": (title) => `Updated the catalogue details of “${title}”`,
  "rights.added": (title) => `Added a rights record to “${title}”`,
  "rights.updated": (title) => `Changed a rights record on “${title}”`,
  "rights.removed": (title) => `Deleted a rights record from “${title}”`,
};

export function getSongActionLabel(action: string, title: string | null): string {
  const template = SONG_ACTION_TEMPLATES[action];
  return template && title ? template(title) : getAuditActionLabel(action);
}

export function getCreatorActionLabel(action: string, handle: string | null): string {
  const template = CREATOR_ACTION_TEMPLATES[action];
  return template && handle ? template(handle) : getAuditActionLabel(action);
}

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
