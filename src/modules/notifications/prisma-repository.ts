import { prisma } from "@/lib/prisma-client";
import type {
  CaseOpenedPayload,
  NotificationRecord,
  NotificationRepository,
  NotificationType,
} from "./types";

/**
 * Prisma-backed `NotificationRepository` (Phase 2) — drop-in replacement
 * for `InMemoryNotificationRepository`, matching `types.ts`'s interface
 * exactly. Not yet wired into `app/_lib/notification-store.ts`: that swap
 * happens once Neon's initial schema push is confirmed live.
 */
export class PrismaNotificationRepository implements NotificationRepository {
  async create(input: {
    workspaceId: string;
    userId: string;
    type: NotificationType;
    payload: CaseOpenedPayload;
  }): Promise<NotificationRecord> {
    const row = await prisma.notification.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        type: input.type,
        payload: input.payload,
        read: false,
      },
    });
    return mapNotification(row);
  }

  async findForUser(workspaceId: string, userId: string): Promise<NotificationRecord[]> {
    const rows = await prisma.notification.findMany({
      where: { workspaceId, userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapNotification);
  }

  async countUnread(workspaceId: string, userId: string): Promise<number> {
    return prisma.notification.count({
      where: { workspaceId, userId, read: false },
    });
  }

  async markAllRead(workspaceId: string, userId: string): Promise<void> {
    // `updateMany` on zero matching rows is a no-op that still succeeds —
    // matches the in-memory version's "no-op if nothing's unread" contract
    // without needing a separate existence check first.
    await prisma.notification.updateMany({
      where: { workspaceId, userId, read: false },
      data: { read: true },
    });
  }
}

function mapNotification(row: {
  id: string;
  workspaceId: string;
  userId: string;
  type: string;
  payload: unknown;
  read: boolean;
  createdAt: Date;
}): NotificationRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    // `type` is a plain `String` column in the schema (this module's own
    // `NotificationType` is the closed set on the application side, per
    // `types.ts`'s comment) — `"CASE_OPENED"` is the only value any writer
    // ever produces today.
    type: row.type as NotificationType,
    payload: row.payload as CaseOpenedPayload,
    read: row.read,
    createdAt: row.createdAt,
  };
}
