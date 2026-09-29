import { requireSession } from "@/app/_lib/current-user";
import { getNotificationStore } from "@/app/_lib/notification-store";
import { WorkspaceHeader } from "@/components/layout/workspace-header";
import { NotificationRow } from "@/components/notifications/notification-row";
import { markAllNotificationsReadAction } from "./actions";

export const metadata = {
  title: "Notifications — RightsWatch",
};

/**
 * Every notification for the current user in their workspace, newest
 * first — the landing page for the badge `WorkspaceHeader` shows on every
 * other `/workspace/*` page. No per-item "mark as read": every mutation
 * elsewhere in this app is an explicit form submission (case status,
 * assign, notes, invites, billing), never an auto-triggered side effect
 * from merely viewing a page, so this follows suit with one explicit "Mark
 * all as read" action rather than marking things read just because they
 * were rendered.
 */
export default async function NotificationsPage() {
  const session = await requireSession();
  const notifications = await getNotificationStore().notifications.findForUser(
    session.workspace.id,
    session.user.id,
  );
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex min-h-screen flex-col">
      <WorkspaceHeader />

      <main className="mx-auto w-full max-w-(--content-width) flex-1 px-6 py-8 [--content-width:1100px]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
            <p className="mt-1 text-sm text-t2">
              {unreadCount > 0
                ? `${unreadCount} unread`
                : "You're all caught up."}
            </p>
          </div>
          {unreadCount > 0 && (
            <form action={markAllNotificationsReadAction}>
              <button
                type="submit"
                className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[0.8125rem] font-medium text-t2 hover:bg-hover hover:text-tx"
              >
                Mark all as read
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <h2 className="text-sm font-semibold">No notifications yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-t2">
                You&rsquo;ll see one here whenever a scan opens a new case in this workspace.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {notifications.map((notification) => (
                <NotificationRow key={notification.id} notification={notification} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
