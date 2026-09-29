import type { CaseOpenedPayload, NotificationRecord, NotificationRepository } from "./types";

export interface NotifyCaseOpenedInput {
  workspaceId: string;
  /** Every user to notify — who that is is the caller's call (today,
   *  `app/_lib/workspace-scan-store.ts` passes every workspace member: a
   *  notification is visibility, not an action, and this app never gates
   *  case *visibility* by role, only case *mutations*
   *  (`app/_lib/authorize.ts`'s `canManageCases`) — so unlike that gate,
   *  this module has no opinion on which roles qualify. */
  recipientUserIds: string[];
  payload: CaseOpenedPayload;
}

export interface NotifyCaseOpenedDependencies {
  notificationRepository: NotificationRepository;
}

/**
 * Fans one CASE_OPENED event out to every given recipient, one
 * `NotificationRecord` each. Deliberately dumb: no de-duplication, no
 * idempotency of its own. It doesn't need any — the one real caller only
 * invokes this when `openCase()` reports `created: true` (a genuinely new
 * case, not a re-scan finding an existing one), so "was this case already
 * notified about" is already answered before this function is ever called.
 * Duplicating that check here would just be two places that could disagree.
 */
export async function notifyCaseOpened(
  input: NotifyCaseOpenedInput,
  deps: NotifyCaseOpenedDependencies,
): Promise<NotificationRecord[]> {
  return Promise.all(
    input.recipientUserIds.map((userId) =>
      deps.notificationRepository.create({
        workspaceId: input.workspaceId,
        userId,
        type: "CASE_OPENED",
        payload: input.payload,
      }),
    ),
  );
}
