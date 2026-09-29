"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/app/_lib/current-user";
import { getNotificationStore } from "@/app/_lib/notification-store";

/**
 * No role gate beyond having a session at all — reading and clearing your
 * *own* notifications isn't a workspace mutation the way opening a case or
 * changing billing is (`authorize.ts`'s `requireCaseManager`/
 * `requireWorkspaceManager` don't apply here), it only ever touches rows
 * keyed to the caller's own `userId`. Every role, including VIEWER, gets
 * one.
 */
export async function markAllNotificationsReadAction() {
  const session = await requireSession();
  await getNotificationStore().notifications.markAllRead(session.workspace.id, session.user.id);
  revalidatePath("/workspace/notifications");
}
