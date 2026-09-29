import Link from "next/link";
import { logOutAction } from "@/app/workspace/actions";
import { requireSession } from "@/app/_lib/current-user";
import { getNotificationStore } from "@/app/_lib/notification-store";

/**
 * Shared top-level chrome for the real, authenticated `/workspace/*` area —
 * the counterpart to `AppHeader`, which is Demo Mode's nav (Dashboard /
 * Creators links, "Demo Mode" badge, Log in / Sign up). The two are kept
 * deliberately separate rather than making `AppHeader` branch on session
 * state: a signed-in user needs "Log out", not "Log in" / "Sign up", and
 * has no Demo Mode nav items to begin with.
 *
 * Team and Billing are both visible to every role — Team's member list and
 * Billing's plan summary are read-only for ANALYST/VIEWER, and each page
 * (not this header) is what actually restricts the actions on it, e.g.
 * `workspace/team/actions.ts`'s `requireAdmin`. Notifications is the same:
 * every role gets one, visibility was never gated by role in this app (see
 * `workspace-scan-store.ts`'s own comment on why notification recipients
 * aren't filtered by `canManageCases`).
 *
 * An async Server Component, not a plain function — it calls
 * `requireSession()` and reads the unread notification count itself rather
 * than taking them as props, so every one of its call sites (the workspace,
 * team, billing, audit-log and item-detail pages) needs no change at all
 * when this badge is added. `requireSession()` is a cheap, side-effect-free
 * read (session-cookie.ts + in-memory lookups), so calling it a second time
 * per request — the rendering page already called it once — costs nothing
 * worth avoiding.
 */
export async function WorkspaceHeader() {
  const session = await requireSession();
  const unreadCount = await getNotificationStore().notifications.countUnread(
    session.workspace.id,
    session.user.id,
  );

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-(--content-width) items-center justify-between px-6 py-4 [--content-width:1100px]">
        <div className="flex items-center gap-6">
          <Link href="/workspace" className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-tx text-[0.6875rem] font-semibold text-bg">
              RW
            </span>
            <span className="text-[0.9375rem] font-semibold">RightsWatch</span>
          </Link>
          <nav className="hidden items-center gap-4 sm:flex">
            <Link
              href="/workspace/notifications"
              className="flex items-center gap-1.5 text-sm text-t2 hover:text-tx"
            >
              Notifications
              {unreadCount > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-review-bg px-1.5 text-[0.6875rem] font-semibold text-review">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
            <Link href="/workspace/team" className="text-sm text-t2 hover:text-tx">
              Team
            </Link>
            <Link href="/workspace/audit" className="text-sm text-t2 hover:text-tx">
              Audit log
            </Link>
            <Link href="/workspace/billing" className="text-sm text-t2 hover:text-tx">
              Billing
            </Link>
          </nav>
        </div>
        <form action={logOutAction}>
          <button
            type="submit"
            className="rounded-full px-3 py-1.5 text-sm text-t2 hover:bg-hover hover:text-tx"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
