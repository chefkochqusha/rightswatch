import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names and resolves Tailwind conflicts (`cn("px-2", cond && "px-4")`
 * gives `px-4`). It's the helper shadcn-style components import from
 * `@/lib/utils`, so blocks copied from catalogues such as Watermelon UI work
 * here without edits.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
