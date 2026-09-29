/**
 * In-app notifications (`prisma/schema.prisma`'s `Notification` model —
 * `{ id, workspaceId, userId, type, payload, read, createdAt }`). Field
 * names mirror it exactly, same drop-in-Prisma-later pattern as every other
 * module.
 *
 * `NotificationPreference` (the paired schema model — a per-user, per-
 * channel `"email" | "in_app"` on/off toggle) is deliberately NOT built
 * here, for the same reason `billing/types.ts` leaves `PlanEntitlement`/
 * `UsageRecord` unbuilt: there's only one channel that actually exists
 * (in-app — see below), so a toggle between channels would have nothing
 * real to switch between yet. Building it now would be speculative scope,
 * not a real requirement.
 *
 * Email is deliberately out of scope too — this project has no email-
 * sending mechanism (`.env.example` has no mail provider var, and
 * `invite-teammate.ts`'s invite links are shown in-app for the inviter to
 * copy and send themselves for the exact same reason). In-app is the one
 * channel with no external dependency, so it's the one built.
 */

/** A plain string, not a union, deliberately: a notification type is
 *  whatever a future producer needs it to be (a Case status change, an
 *  invite accepted, a subscription past due...), and this module shouldn't
 *  need to change every time a new one is added elsewhere. `CASE_OPENED`
 *  is the one producer that exists today (`app/_lib/workspace-scan-store.ts`). */
export type NotificationType = "CASE_OPENED";

/** Payload shape for a `CASE_OPENED` notification — enough for a UI to
 *  render "New case opened for @creator — <status>" and link to the item.
 *  `status` is a plain string (not `RightsAssessmentStatus` from
 *  `rights-engine/types`) so this module stays as decoupled from the
 *  rights engine as `modules/cases` already is (`Case.rightsAssessmentId`
 *  is just a string there too, never a typed cross-module reference). */
export interface CaseOpenedPayload {
  caseId: string;
  contentId: string;
  creatorUsername: string;
  status: string;
}

export interface NotificationRecord {
  id: string;
  workspaceId: string;
  userId: string;
  type: NotificationType;
  payload: CaseOpenedPayload;
  read: boolean;
  createdAt: Date;
}

export interface NotificationRepository {
  create(input: {
    workspaceId: string;
    userId: string;
    type: NotificationType;
    payload: CaseOpenedPayload;
  }): Promise<NotificationRecord>;
  /** Newest first — the order a notification list reads in. */
  findForUser(workspaceId: string, userId: string): Promise<NotificationRecord[]>;
  countUnread(workspaceId: string, userId: string): Promise<number>;
  /** No-op if there's nothing unread — callers don't need to check first. */
  markAllRead(workspaceId: string, userId: string): Promise<void>;
}
