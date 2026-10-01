export interface WorkspaceNavItem {
  href: string;
  label: string;
  /** Extra path prefixes that count as "this section" — e.g. an item's
   *  detail page belongs to the list it was opened from. */
  alsoActiveFor?: string[];
  /** Unread count, rendered as a pill when above zero. */
  badge?: number;
}

/** Whether `pathname` is inside this nav item's section. Kept out of the
 *  Client Component so it's testable without React. */
export function isActive(item: WorkspaceNavItem, pathname: string): boolean {
  const prefixes = [item.href, ...(item.alsoActiveFor ?? [])];
  return prefixes.some((prefix) =>
    // The workspace root is a section of its own (Overview), not a prefix
    // of every other section.
    prefix === "/workspace" ? pathname === prefix : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
