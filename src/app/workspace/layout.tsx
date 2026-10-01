import Link from "next/link";
import { getConnectorMode } from "@/app/_lib/connector-mode";
import { requireSession } from "@/app/_lib/current-user";
import { getNotificationStore } from "@/app/_lib/notification-store";
import { logOutAction } from "@/app/workspace/actions";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import type { WorkspaceNavItem } from "@/components/layout/nav-active";
import { ROLE_LABELS } from "@/components/team/labels";

/**
 * The authenticated app's chrome (Brief §6, §29): a sidebar with the
 * workspace's sections, and a top bar naming the workspace you're in and
 * who you're signed in as.
 *
 * Only sections that exist are listed — no dead navigation (Brief §63).
 * Each one appears here in the Brief's §6 order as it's built.
 *
 * Pages still call `requireSession()` themselves: a layout doesn't re-render
 * on navigation, so it can't be the thing that guards a page (Next's
 * authentication guide). This one calls it to render the chrome — the
 * lookup is cached per request, so the page's own call is free.
 *
 * The unread badge is read here, so it updates when a Server Action
 * revalidates the layout (marking notifications read, a scan opening
 * cases) or on the next full page load — not on every client-side
 * navigation, which reuses the layout as rendered.
 */
export default async function WorkspaceLayout({ children }: LayoutProps<"/workspace">) {
  const session = await requireSession();
  const unreadCount = await getNotificationStore().notifications.countUnread(
    session.workspace.id,
    session.user.id,
  );

  const primary: WorkspaceNavItem[] = [
    { href: "/workspace", label: "Overview", alsoActiveFor: ["/workspace/items"] },
    { href: "/workspace/creators", label: "Creators" },
    { href: "/workspace/team", label: "Team" },
    { href: "/workspace/billing", label: "Billing" },
  ];
  const secondary: WorkspaceNavItem[] = [
    { href: "/workspace/notifications", label: "Notifications", badge: unreadCount },
    { href: "/workspace/audit", label: "Audit log" },
  ];

  return (
    <div className="flex-1 md:grid md:grid-cols-[15.5rem_minmax(0,1fr)]">
      {/* The grid cell carries the background so it runs the full height of
          a long page; the sidebar inside it stays put while the page
          scrolls. */}
      <div className="border-b border-line bg-surface-2 md:border-r md:border-b-0">
        <aside className="px-4 pt-4 pb-2 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:gap-8 md:overflow-y-auto md:py-6">
          <Link href="/workspace" className="mb-3 flex items-center gap-2.5 px-2 md:mb-0">
            <span
              aria-hidden="true"
              className="grid h-7 w-7 place-items-center rounded-lg bg-tx text-[0.6875rem] font-semibold text-bg"
            >
              RW
            </span>
            <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">RightsWatch</span>
          </Link>
          <WorkspaceNav primary={primary} secondary={secondary} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-line bg-bg px-4 py-3 md:sticky md:top-0 md:z-10 md:px-10">
          <div className="flex min-w-0 items-center gap-2 text-[0.8125rem]">
            <span className="truncate font-semibold text-tx">{session.workspace.name}</span>
            {getConnectorMode() === "DEMO" && (
              <span
                title="TikTok isn't connected yet, so scans run against fictional demo data."
                className="shrink-0 rounded-full bg-review-bg px-2.5 py-0.5 text-xs font-medium text-review"
              >
                Demo data
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3 text-[0.8125rem]">
            <span className="hidden text-right leading-tight sm:block">
              <span className="block text-tx">{session.user.name ?? session.user.email}</span>
              <span className="block text-xs text-t2">{ROLE_LABELS[session.role]}</span>
            </span>
            <form action={logOutAction}>
              <button
                type="submit"
                className="rounded-full px-3 py-1.5 text-[0.8125rem] font-medium text-t2 hover:bg-hover hover:text-tx"
              >
                Log out
              </button>
            </form>
          </div>
        </header>

        <main className="w-full max-w-[76rem] flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
      </div>
    </div>
  );
}
