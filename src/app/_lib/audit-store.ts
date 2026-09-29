import { InMemoryAuditLogRepository } from "@/modules/audit";

/**
 * One shared in-memory AuditLog store per server process — same rationale
 * and same caveats as `auth-store.ts`, `case-store.ts` and
 * `notification-store.ts` (Prisma-backed later, cached on `globalThis` for
 * `next dev`, not for production).
 */
interface AuditStore {
  auditLogs: InMemoryAuditLogRepository;
}

const globalForAudit = globalThis as unknown as {
  __rightswatchAuditStore?: AuditStore;
};

export function getAuditStore(): AuditStore {
  if (!globalForAudit.__rightswatchAuditStore) {
    globalForAudit.__rightswatchAuditStore = {
      auditLogs: new InMemoryAuditLogRepository(),
    };
  }
  return globalForAudit.__rightswatchAuditStore;
}
