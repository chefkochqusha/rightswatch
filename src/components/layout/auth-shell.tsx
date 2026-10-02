import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared chrome for the signup and login pages — a centered card on the
 * app background, matching DESIGN_SYSTEM.md rather than inventing a
 * separate "marketing" look for just these two pages.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-tx text-[0.6875rem] font-semibold text-bg">
            RW
          </span>
          <span className="text-[0.9375rem] font-semibold text-tx">RightsWatch</span>
        </Link>

        <div className="rounded-lg border border-line bg-surface p-6">
          <h1 className="text-xl font-semibold tracking-tight text-tx">{title}</h1>
          <p className="mt-1 text-sm text-t2">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>

        <p className="mt-4 text-center text-sm text-t2">{footer}</p>
      </div>
    </main>
  );
}
