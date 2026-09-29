import { prisma } from "@/lib/prisma-client";
import type { AuditLogRecord, AuditLogRepository } from "./types";

/**
 * Prisma-backed `AuditLogRepository` (Phase 2) — drop-in replacement for
 * `InMemoryAuditLogRepository`, matching `types.ts`'s interface exactly.
 * Not yet wired into `app/_lib/audit-store.ts`: that swap happens once
 * Neon's initial schema push is confirmed live (see `ARCHITECTURE.md`).
 */
export class PrismaAuditLogRepository implements AuditLogRepository {
  async create(input: {
    workspaceId: string;
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<AuditLogRecord> {
    const row = await prisma.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata ?? null,
      },
    });
    return mapAuditLog(row);
  }

  async findForWorkspace(workspaceId: string): Promise<AuditLogRecord[]> {
    const rows = await prisma.auditLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapAuditLog);
  }
}

function mapAuditLog(row: {
  id: string;
  workspaceId: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: unknown;
  createdAt: Date;
}): AuditLogRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    actorId: row.actorId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    // `metadata` is `Json?` — always a plain object or null in practice
    // (every writer here passes `Record<string, unknown> | null | undefined`
    // in), never an array or bare scalar, so this narrowing is safe.
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: row.createdAt,
  };
}
