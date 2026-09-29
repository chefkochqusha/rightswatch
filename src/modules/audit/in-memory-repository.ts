import { randomUUID } from "node:crypto";
import type { AuditLogRecord, AuditLogRepository } from "./types";

/**
 * Process-memory stand-in for the Prisma-backed repository Phase 4 will
 * eventually provide — see `modules/auth/in-memory-repositories.ts` for the
 * full rationale (same sandbox limitation, same swap-later pattern, same
 * NOT-for-production caveat applies here verbatim).
 */
export class InMemoryAuditLogRepository implements AuditLogRepository {
  private readonly byId = new Map<string, AuditLogRecord>();

  async create(input: {
    workspaceId: string;
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<AuditLogRecord> {
    const record: AuditLogRecord = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? null,
      createdAt: new Date(),
    };
    this.byId.set(record.id, record);
    return record;
  }

  async findForWorkspace(workspaceId: string): Promise<AuditLogRecord[]> {
    return Array.from(this.byId.values())
      .filter((entry) => entry.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
