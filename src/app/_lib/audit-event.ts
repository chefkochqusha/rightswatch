import { getAuditStore } from "./audit-store";

/**
 * Writes one entry to the workspace's activity log for an event that matters
 * for security or the account (password change, invite, plan change, data
 * export). The action it records has already happened, so a failed write is
 * logged (action name only, nothing personal) and never turns that action
 * into an error for the person.
 */
export async function recordAudit(entry: {
  workspaceId: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await getAuditStore().auditLogs.create({ ...entry, metadata: entry.metadata ?? null });
  } catch {
    console.error(JSON.stringify({ source: "audit_write_failed", action: entry.action }));
  }
}
