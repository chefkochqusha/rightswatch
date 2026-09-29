import { getPrisma } from "@/lib/prisma-client";
import type { Prisma } from "@/generated/prisma/client";
import type { AuditLogRecord, AuditLogRepository } from "./types";

/**
 * Prisma-backed `AuditLogRepository` (Phase 2) — drop-in replacement for
 * `InMemoryAuditLogRepository`, matching `types.ts`'s interface exactly.
 * Wired into `app/_lib/audit-store.ts` now that Neon's schema push is live.
 *
 * `getPrisma()`, not a top-level `prisma` binding — see
 * `src/lib/prisma-client.ts`'s doc comment for why: a plain `import { prisma }`
 * (or any other *value* import from the generated client) at this file's
 * top level would crash any test that merely imports this module, even one
 * that never calls `create`/`findForWorkspace`.
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
    // `Prisma.DbNull` is a runtime sentinel value, not just a type, so it
    // can't come from the `import type` above (that's erased entirely at
    // compile time). Deferred `require()` for the same reason `getPrisma()`
    // itself is deferred: a top-level *value* import of anything from the
    // generated client crashes at module-load time in this sandbox, where
    // that client doesn't exist.
    /* eslint-disable-next-line @typescript-eslint/no-require-imports -- deferred on purpose, see comment above */
    const { Prisma: PrismaRuntime } = require("../../generated/prisma/client");
    const row = await getPrisma().auditLog.create({
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
          : PrismaRuntime.DbNull,
      },
    });
    return mapAuditLog(row);
  }

  async findForWorkspace(workspaceId: string): Promise<AuditLogRecord[]> {
    const rows = await getPrisma().auditLog.findMany({
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
