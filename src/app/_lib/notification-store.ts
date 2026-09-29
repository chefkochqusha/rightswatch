import { PrismaNotificationRepository } from "@/modules/notifications/prisma-repository";

/**
 * One shared Notification store per server process. Prisma-backed as of
 * Phase 2 (Neon is live) — same rationale as `auth-store.ts` for why
 * nothing else needed to change.
 */
interface NotificationStore {
  notifications: PrismaNotificationRepository;
}

const globalForNotifications = globalThis as unknown as {
  __rightswatchNotificationStore?: NotificationStore;
};

export function getNotificationStore(): NotificationStore {
  if (!globalForNotifications.__rightswatchNotificationStore) {
    globalForNotifications.__rightswatchNotificationStore = {
      notifications: new PrismaNotificationRepository(),
    };
  }
  return globalForNotifications.__rightswatchNotificationStore;
}
