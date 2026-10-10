import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "@/components/brand/logo-mark";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#verdicts", label: "Rights checks" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
] as const;

/** The public site's top bar: the name, four anchors, and the two ways in. */
export function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="mx-auto flex h-16 max-w-[80rem] items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-[0.9375rem] font-semibold">{BRAND.name}</span>
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-full px-3 py-1.5 text-sm text-t2 hover:bg-hover hover:text-tx">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <Link href="/login" className="rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap text-tx hover:bg-hover">
            Log in
          </Link>
          <Link href="/signup" className={buttonStyles("primary")}>
            Start monitoring
          </Link>
        </div>
      </div>
    </header>
  );
}
