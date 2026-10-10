import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "@/components/brand/logo-mark";

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
          <LogoMark />
          <span className="text-[0.9375rem] font-semibold text-tx">{BRAND.name}</span>
        </Link>

        <div className="rounded-[1.25rem] border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] sm:p-8">
          <h1 className="font-display text-[1.625rem] leading-[1.1] font-extrabold tracking-[-0.03em] text-tx">{title}</h1>
          <p className="mt-1 text-sm text-t2">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>

        <p className="mt-4 text-center text-sm text-t2">{footer}</p>
      </div>
    </main>
  );
}
