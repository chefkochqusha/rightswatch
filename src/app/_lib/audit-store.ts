import { PrismaAuditLogRepository } from "@/modules/audit/prisma-repository";

/**
 * One shared AuditLog store per server process. Prisma-backed as of Phase
 * 2 (Neon is live) — same rationale as `auth-store.ts` for why nothing
 * else needed to change.
 */
interface AuditStore {
  auditLogs: PrismaAuditLogRepository;
}

const globalForAudit = globalThis as unknown as {
  __rightswatchAuditStore?: AuditStore;
};

export function getAuditStore(): AuditStore {
  if (!globalForAudit.__rightswatchAuditStore) {
    globalForAudit.__rightswatchAuditStore = {
      auditLogs: new PrismaAuditLogRepository(),
    };
  }
  return globalForAudit.__rightswatchAuditStore;
}
