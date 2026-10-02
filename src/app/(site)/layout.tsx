import "@fontsource-variable/bricolage-grotesque/opsz.css";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

/** The public pages: the landing page and the legal pages. */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Skip to content</a>
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
