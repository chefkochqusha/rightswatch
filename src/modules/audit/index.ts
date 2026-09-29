export type { AuditLogRecord, AuditLogRepository } from "./types";
export { InMemoryAuditLogRepository } from "./in-memory-repository";

// `PrismaAuditLogRepository` is deliberately NOT re-exported here — same
// reasoning as `modules/notifications/index.ts`: it transitively imports
// `@/lib/prisma-client`, which needs the generated Prisma client (absent
// in this build sandbox) and a DB connection string, and this barrel is
// used by every in-memory-only consumer. Import it directly from
// "@/modules/audit/prisma-repository" once it's wired into
// `app/_lib/audit-store.ts`.
