export type {
  NotificationType,
  CaseOpenedPayload,
  NotificationRecord,
  NotificationRepository,
} from "./types";

export { InMemoryNotificationRepository } from "./in-memory-repository";

// `PrismaNotificationRepository` is deliberately NOT re-exported here.
// This barrel is imported by Demo Mode and every in-memory-only consumer,
// and `./prisma-repository` transitively imports `@/lib/prisma-client`,
// which requires the generated Prisma client to exist on disk (it doesn't
// in this build sandbox — see `prisma.config.ts`) and a database
// connection string to be configured. Re-exporting it here would make
// *every* consumer of this barrel eagerly pull that in. Import it directly
// from "@/modules/notifications/prisma-repository" instead, once it's
// actually wired into `app/_lib/notification-store.ts`.

export { notifyCaseOpened } from "./notify-case-opened";
export type { NotifyCaseOpenedInput, NotifyCaseOpenedDependencies } from "./notify-case-opened";
