import { AutoRefresh } from "@/components/ui/auto-refresh";

/**
 * Shown while a scan waits or runs in the background (our own server's
 * worker, `app/_lib/job-runner.ts`). Reloads the page's data every few
 * seconds, so the results appear without a manual refresh, and stops once
 * the scan is done (the server then no longer renders this).
 */
export function ScanInProgress({ running, retrying }: { running: boolean; retrying: boolean }) {
  return (
    <>
    <AutoRefresh everyMs={5_000} />
    <p role="status" aria-live="polite" className="rounded-[0.875rem] border border-line bg-surface px-4 py-3 text-[0.875rem] text-t2">
      {retrying
        ? "The last try of this scan failed. It will try again in a few minutes."
        : running
          ? "A scan is running. New results appear here when it's done."
          : "A scan is waiting to start. New results appear here when it's done."}
    </p>
    </>
  );
}
