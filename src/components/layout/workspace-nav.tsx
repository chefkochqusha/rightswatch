"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, type WorkspaceNavItem } from "./nav-active";

/**
 * The workspace's section navigation (Brief §6). A Client Component only
 * because the active section comes from `usePathname()`: the layout that
 * renders it doesn't re-render on navigation, so it can't know the current
 * path itself (Next's layout docs, "Pathname").
 *
 * One list, two presentations: a vertical sidebar from `md` up, and a
 * horizontally scrolling row on small screens (Brief §39: "sidebar becomes
 * compact"), the same breakpoint behavior as the validated prototype.
 */
export function WorkspaceNav({
  primary,
  secondary,
}: {
  primary: WorkspaceNavItem[];
  secondary: WorkspaceNavItem[];
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Workspace"
      className="relative -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-col md:gap-6 md:overflow-visible md:px-0 md:pb-0"
    >
      <NavList items={primary} pathname={pathname} />
      <NavList items={secondary} pathname={pathname} />
    </nav>
  );
}

function NavList({ items, pathname }: { items: WorkspaceNavItem[]; pathname: string }) {
  return (
    <ul className="flex shrink-0 gap-1 md:flex-col md:gap-0.5">
      {items.map((item) => {
        const active = isActive(item, pathname);
        return (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center justify-between gap-2 rounded-[0.625rem] px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                active ? "bg-surface text-tx ring-1 ring-line" : "text-t2 hover:bg-hover hover:text-tx"
              }`}
            >
              {item.label}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-review-bg px-1.5 text-[0.6875rem] font-semibold text-review">
                  <span className="sr-only">unread:</span>
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
