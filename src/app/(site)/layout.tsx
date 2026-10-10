import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { MotionProvider } from "@/components/marketing/motion-provider";

// Without JavaScript the entrance animations never run, so show their content as is.
const NO_SCRIPT_CSS =
  '[style*="opacity:0"]{opacity:1!important;transform:none!important;filter:none!important}';

/** The public pages: the landing page and the legal pages. */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <MotionProvider>
      <div className="relative flex min-h-screen flex-col">
        <noscript>
          <style>{NO_SCRIPT_CSS}</style>
        </noscript>
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </div>
    </MotionProvider>
  );
}
