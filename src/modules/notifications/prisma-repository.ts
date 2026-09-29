import { getPrisma } from "@/lib/prisma-client";
import type { Prisma } from "@/generated/prisma/client";
import type {
  CaseOpenedPayload,
  NotificationRecord,
  NotificationRepository,
  NotificationType,
} from "./types";

/**
 * Prisma-backed `NotificationRepository` (Phase 2) — drop-in replacement
 * for `InMemoryNotificationRepository`, matching `types.ts`'s interface
 * exactly. Wired into `app/_lib/notification-store.ts` now that Neon's
 * schema push is live.
 *
 * `getPrisma()`, not a top-level `prisma` binding — see
 * `src/lib/prisma-client.ts`'s doc comment for why.
 */
export class PrismaNotificationRepository implements NotificationRepository {
  async create(input: {
    workspaceId: string;
    userId: string;
    type: NotificationType;
    payload: CaseOpenedPayload;
  }): Promise<NotificationRecord> {
    const row = await getPrisma().notification.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        type: input.type,
        // `CaseOpenedPayload` is a plain TS `interface`, which structurally
        // lacks the index signature Prisma's generated `InputJsonObject`
        // requires for a `Json` column — confirmed by Vercel's build once
        // the real generated types existed to check against. Every field
        // on it is already a plain string, so this is a representation-
        // bridging cast (same rationale as the enum-bridging casts in
        // `modules/auth/prisma-repositories.ts`), not a real type risk.
        payload: input.payload as unknown as Prisma.InputJsonValue,
        read: false,
      },
    });
    return mapNotification(row);
  }

  async findForUser(workspaceId: string, userId: string): Promise<NotificationRecord[]> {
    const rows = await getPrisma().notification.findMany({
      where: { workspaceId, userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(mapNotification);
  }

  async countUnread(workspaceId: string, userId: string): Promise<number> {
    return getPrisma().notification.count({
      where: { workspaceId, userId, read: false },
    });
  }

  async markAllRead(workspaceId: string, userId: string): Promise<void> {
    // `updateMany` on zero matching rows is a no-op that still succeeds —
    // matches the in-memory version's "no-op if nothing's unread" contract
    // without needing a separate existence check first.
    await getPrisma().notification.updateMany({
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
