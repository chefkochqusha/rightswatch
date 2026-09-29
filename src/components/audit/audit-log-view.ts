import type { AuditLogRecord } from "@/modules/audit";
import type { CaseRecord } from "@/modules/cases";
import type { UserRecord } from "@/modules/auth";
import { getContentIdFromRightsAssessmentId } from "@/app/_lib/workspace-scan-store";
import { getAuditActionLabel, getCaseStatusLabelOrRaw } from "./labels";

/**
 * The audit log page's view-model: everything `AuditLogRow` needs, already
 * resolved to plain, renderable strings. Kept separate from the page and
 * the row component so the resolution logic below — the one part of this
 * feature with real branching to get wrong (open-ended `action`/
 * `targetType` strings, `metadata` typed as `unknown`, a case that no
 * longer resolves) — is plain, I/O-free, and unit-testable on its own,
 * the same way `rights-engine/assess.ts` is kept pure and separate from
 * the pages that call it.
 */
export interface AuditLogEntryView {
  id: string;
  createdAt: Date;
  actorLabel: string;
  description: string;
  href: string | null;
}

function getMetadataString(metadata: Record<string, unknown> | null, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

/**
 * Shared by both "who did this" (the actor) and "who was this assigned
 * to" (assignee metadata) — the only real difference between the two is
 * what a `null` id means, so that's the one thing callers supply.
 */
function describeUser(
  userId: string | null,
  members: Map<string, UserRecord>,
  currentUserId: string,
  whenNull: string,
): string {
  if (userId === null) return whenNull;
  if (userId === currentUserId) return "You";
  const user = members.get(userId);
  // A membership can only be added in this app today, never removed, so
  // this branch is unreachable by anything this app itself writes — but
  // `metadata`/`actorId` ids are read back as plain strings with no
  // referential guarantee, so degrading gracefully here costs nothing.
  return user?.name ?? user?.email ?? "A former teammate";
}

function describeAction(
  entry: AuditLogRecord,
  members: Map<string, UserRecord>,
  currentUserId: string,
): string {
  switch (entry.action) {
    case "case.status_changed": {
      const from = getMetadataString(entry.metadata, "from");
      const to = getMetadataString(entry.metadata, "to");
      if (from === null || to === null) return getAuditActionLabel(entry.action);
      return `Changed the case status from ${getCaseStatusLabelOrRaw(from)} to ${getCaseStatusLabelOrRaw(to)}`;
    }
    case "case.assignee_changed": {
      const from = describeUser(
        getMetadataString(entry.metadata, "from"),
        members,
        currentUserId,
        "Unassigned",
      );
      const to = describeUser(
        getMetadataString(entry.metadata, "to"),
        members,
        currentUserId,
        "Unassigned",
      );
      return `Changed the case assignment from ${from} to ${to}`;
    }
    default:
      // Covers "case.opened" today, and — deliberately, since `action` is
      // an open string — anything a future caller ever writes that this
      // file hasn't been taught a richer description for.
      return getAuditActionLabel(entry.action);
  }
}

/**
 * Only ever resolves a link for `targetType === "case"`, the only target
 * type any real caller writes today (`modules/audit/types.ts`). Anything
 * else — including a "case" entry whose case can't be found in `casesById`
 * for some reason — degrades to no link rather than a broken one.
 */
function resolveHref(
  entry: AuditLogRecord,
  workspaceId: string,
  casesById: Map<string, CaseRecord>,
): string | null {
  if (entry.targetType !== "case") return null;
  const relatedCase = casesById.get(entry.targetId);
  if (!relatedCase) return null;
  const contentId = getContentIdFromRightsAssessmentId(workspaceId, relatedCase.rightsAssessmentId);
  return contentId ? `/workspace/items/${encodeURIComponent(contentId)}` : null;
}

export function buildAuditLogView(
  entries: AuditLogRecord[],
  context: {
    workspaceId: string;
    currentUserId: string;
    members: Map<string, UserRecord>;
    casesById: Map<string, CaseRecord>;
  },
): AuditLogEntryView[] {
  return entries.map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    actorLabel: describeUser(entry.actorId, context.members, context.currentUserId, "System"),
    description: describeAction(entry, context.members, context.currentUserId),
    href: resolveHref(entry, context.workspaceId, context.casesById),
  }));
}
