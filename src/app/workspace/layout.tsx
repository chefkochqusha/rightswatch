import Link from "next/link";
import { dataModeFor } from "@/app/_lib/connector-mode";
import { requireSession } from "@/app/_lib/current-user";
import { getNotificationStore } from "@/app/_lib/notification-store";
import { DEMO_WORKSPACE_SLUG } from "@/app/_lib/demo-access";
import { leaveDemoAction } from "@/app/demo/actions";
import { logOutAction } from "@/app/workspace/actions";
import { getEmailSender } from "@/app/_lib/email";
import { VerifyEmailBanner } from "@/components/layout/verify-email-banner";
import { WorkspaceNav } from "@/components/layout/workspace-nav";
import type { WorkspaceNavItem } from "@/components/layout/nav-active";
import { ROLE_LABELS } from "@/components/team/labels";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "@/components/brand/logo-mark";

// The app, the public demo included, stays out of search results.
export const metadata = { robots: { index: false, follow: false } };

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

  const isDemo = session.workspace.slug === DEMO_WORKSPACE_SLUG;
  // Only ask when a link can actually be sent: nagging for something nobody can do is noise.
  const askToVerify = !isDemo && !session.user.emailVerified && getEmailSender().mode === "RESEND";

  const primary: WorkspaceNavItem[] = [
    { href: "/workspace", label: "Overview", alsoActiveFor: ["/workspace/items"] },
    { href: "/workspace/creators", label: "Creators" },
    { href: "/workspace/matches", label: "Music Matches" },
    { href: "/workspace/cases", label: "Cases" },
    { href: "/workspace/rights", label: "Rights Library" },
    { href: "/workspace/reports", label: "Reports" },
    { href: "/workspace/team", label: "Team" },
    { href: "/workspace/billing", label: "Billing" },
  ];
  const secondary: WorkspaceNavItem[] = [
    { href: "/workspace/notifications", label: "Notifications", badge: unreadCount },
    { href: "/workspace/audit", label: "Audit log" },
    { href: "/workspace/settings", label: "Settings" },
  ];

  return (
    <div className="flex-1 md:grid md:grid-cols-[15.5rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only z-50 rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Skip to content</a>
      {/* The grid cell carries the background so it runs the full height of
          a long page; the sidebar inside it stays put while the page
          scrolls. */}
      <div className="border-b border-line bg-surface-2 md:border-r md:border-b-0">
        <aside className="px-4 pt-4 pb-2 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:gap-8 md:overflow-y-auto md:py-6">
          <Link href="/workspace" className="mb-3 flex items-center gap-2.5 px-2 md:mb-0">
            <LogoMark />
            <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">{BRAND.name}</span>
          </Link>
          <WorkspaceNav primary={primary} secondary={secondary} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-col">
        {isDemo && (
          <aside aria-label="Public demo" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-tx px-4 py-2.5 text-[0.8125rem] text-bg md:px-10">
            <p>
              <span className="font-semibold">Public demo.</span> Fictional creators and rights data, view only. Nothing here is a real TikTok post.
            </p>
            <form action={leaveDemoAction}>
              <button type="submit" className="rounded-full bg-bg px-3.5 py-1 text-[0.8125rem] font-semibold text-tx hover:opacity-90">
                Start your own workspace
              </button>
            </form>
          </aside>
        )}
        {askToVerify && <VerifyEmailBanner email={session.user.email} />}
        <header className="flex items-center justify-between gap-4 border-b border-line bg-bg px-4 py-3 md:sticky md:top-0 md:z-10 md:px-10">
          <div className="flex min-w-0 items-center gap-2 text-[0.8125rem]">
            <span className="truncate font-semibold text-tx">{session.workspace.name}</span>
            {dataModeFor(session.workspace) === "DEMO" && (
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

        <main id="main" className="w-full max-w-[76rem] flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
      </div>
    </div>
  );
}
