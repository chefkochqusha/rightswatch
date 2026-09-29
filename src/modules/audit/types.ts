/**
 * Workspace audit trail (`prisma/schema.prisma`'s `AuditLog` model —
 * `{ id, workspaceId, actorId?, action, targetType, targetId, metadata?,
 * createdAt }`). Field names mirror it exactly, same drop-in-Prisma-later
 * pattern as every other module.
 *
 * `action` and `targetType` are `string`, matching the schema's own
 * (unconstrained) column types — there's no fixed, closed set of things
 * this app might ever want to audit, so this module has no opinion on what
 * strings a caller uses. `"case.opened"`, `"case.status_changed"`, and
 * `"case.assignee_changed"` (all `targetType: "case"`) are the only
 * actions a real caller writes today
 * (`app/workspace/items/[contentId]/case-actions.ts`) — anything else
 * (invites, subscriptions, logins) can start writing its own pairs here
 * without this module changing at all.
 *
 * There's no UI to browse this yet (no page reads `findForWorkspace`) —
 * writing a real, queryable trail for a compliance-adjacent product is the
 * useful part on its own, and a page to view it is a separate, later unit
 * of work, not a reason to leave the writing side unbuilt too.
 */

export interface AuditLogRecord {
  id: string;
  workspaceId: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditLogRepository {
  create(input: {
    workspaceId: string;
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<AuditLogRecord>;
  /** Newest first — the order an audit trail reads in. */
  findForWorkspace(workspaceId: string): Promise<AuditLogRecord[]>;
}
