import Link from "next/link";

const NAV_ITEMS = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard" },
  { key: "creators", href: "/creators", label: "Creators" },
] as const;

type NavKey = (typeof NAV_ITEMS)[number]["key"];

/**
 * Shared top-level chrome for every real app page (DESIGN_SYSTEM.md "Nav").
 * Deliberately excludes the assessment detail page from `active` matching
 * — it's reached by drilling into a row, not a primary section, so no nav
 * item lights up for it.
 */
export function AppHeader({ active }: { active?: NavKey }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-(--content-width) items-center justify-between px-6 py-4 [--content-width:1100px]">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-tx text-[0.6875rem] font-semibold text-bg">
              RW
            </span>
            <span className="text-[0.9375rem] font-semibold">RightsWatch</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                aria-current={item.key === active ? "page" : undefined}
                className={
                  item.key === active
                    ? "rounded-full bg-surface px-3 py-1.5 text-sm text-tx ring-1 ring-line"
                    : "rounded-full px-3 py-1.5 text-sm text-t2 hover:bg-hover hover:text-tx"
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-hover px-2.5 py-1 text-xs font-medium text-t2">
            Demo Mode
          </span>
          <Link href="/login" className="text-[0.8125rem] font-medium text-t2 hover:text-tx">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-tx px-3 py-1.5 text-[0.8125rem] font-medium text-bg transition hover:opacity-90"
          >
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}
