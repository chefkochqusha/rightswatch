import { InMemoryNotificationRepository } from "@/modules/notifications";

/**
 * One shared in-memory Notification store per server process — same
 * rationale and same caveats as `auth-store.ts`, `case-store.ts` and
 * `workspace-scan-store.ts` (Prisma-backed later, cached on `globalThis`
 * for `next dev`, not for production).
 */
interface NotificationStore {
  notifications: InMemoryNotificationRepository;
}

const globalForNotifications = globalThis as unknown as {
  __rightswatchNotificationStore?: NotificationStore;
};

export function getNotificationStore(): NotificationStore {
  if (!globalForNotifications.__rightswatchNotificationStore) {
    globalForNotifications.__rightswatchNotificationStore = {
      notifications: new InMemoryNotificationRepository(),
    };
  }
  return globalForNotifications.__rightswatchNotificationStore;
}
