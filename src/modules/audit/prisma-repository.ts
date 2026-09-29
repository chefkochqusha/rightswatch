import { prisma } from "@/lib/prisma-client";
import { Prisma } from "@/generated/prisma/client";
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
        // `metadata` is an optional `Json?` column, needing two casts
        // Prisma's real generated types require (both only catchable once
        // those types exist to check against, which this sandbox's `tsc`
        // run can't do — confirmed by Vercel's build, one error at a time):
        // (1) a bare `null` isn't accepted — `Prisma.DbNull` is the
        // documented sentinel for "set this Json column to SQL NULL," as
        // opposed to `Prisma.JsonNull` (store the JSON literal `null` as
        // the value) — SQL NULL is what "no metadata" means here; (2) a
        // plain `Record<string, unknown>` isn't directly assignable either
        // — its index signature's `unknown` value type doesn't structurally
        // satisfy Prisma's `InputJsonValue`, same underlying reason
        // `CaseOpenedPayload` needed a cast in
        // `modules/notifications/prisma-repository.ts` — so it needs the
        // same representation-bridging `as unknown as` cast.
        metadata: input.metadata
          ? (input.metadata as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
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
