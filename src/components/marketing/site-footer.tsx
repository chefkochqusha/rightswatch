import Link from "next/link";
import { DemoButton } from "./demo-button";

/** The public site's footer. The legal pages are linked from every page (§58). */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[80rem] flex-col gap-8 px-5 py-10 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <p className="flex items-center gap-2.5 text-[0.9375rem] font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-tx text-[0.6875rem] font-semibold text-bg">RW</span>
            RightsWatch
          </p>
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-t2">
            RightsWatch flags potential rights mismatches for a person to review. It doesn&apos;t make legal determinations.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
          <DemoButton className="text-left text-t2 hover:text-tx">Demo</DemoButton>
          <Link href="/imprint" className="text-t2 hover:text-tx">Imprint</Link>
          <Link href="/login" className="text-t2 hover:text-tx">Log in</Link>
          <Link href="/privacy" className="text-t2 hover:text-tx">Privacy</Link>
          <Link href="/signup" className="text-t2 hover:text-tx">Sign up</Link>
        </nav>
      </div>
    </footer>
  );
}
