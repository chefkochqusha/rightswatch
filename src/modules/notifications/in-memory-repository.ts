import { randomUUID } from "node:crypto";
import type { NotificationRecord, NotificationRepository, NotificationType, CaseOpenedPayload } from "./types";

/**
 * Process-memory stand-in for the Prisma-backed repository Phase 4 will
 * eventually provide — see `modules/auth/in-memory-repositories.ts` for the
 * full rationale (same sandbox limitation, same swap-later pattern, same
 * NOT-for-production caveat applies here verbatim).
 */
export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly byId = new Map<string, NotificationRecord>();

  async create(input: {
    workspaceId: string;
    userId: string;
    type: NotificationType;
    payload: CaseOpenedPayload;
  }): Promise<NotificationRecord> {
    const record: NotificationRecord = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      type: input.type,
      payload: input.payload,
      read: false,
      createdAt: new Date(),
    };
    this.byId.set(record.id, record);
    return record;
  }

  async findForUser(workspaceId: string, userId: string): Promise<NotificationRecord[]> {
    return Array.from(this.byId.values())
      .filter((n) => n.workspaceId === workspaceId && n.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async countUnread(workspaceId: string, userId: string): Promise<number> {
    let count = 0;
    for (const n of this.byId.values()) {
      if (n.workspaceId === workspaceId && n.userId === userId && !n.read) count++;
    }
    return count;
  }

  async markAllRead(workspaceId: string, userId: string): Promise<void> {
    for (const [id, n] of this.byId.entries()) {
      if (n.workspaceId === workspaceId && n.userId === userId && !n.read) {
        this.byId.set(id, { ...n, read: true });
      }
    }
  }
}
