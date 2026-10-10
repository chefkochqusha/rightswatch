"use client";

import { useEffect } from "react";

/**
 * Root-level error boundary (Next.js App Router `error.js` convention —
 * see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`).
 * Catches an uncaught exception from any page or nested layout under the
 * root layout and shows this instead of Next's default dev overlay / 500
 * page. It doesn't cover the root layout itself — see `global-error.tsx`
 * for that.
 *
 * `retry` (stable as of Next 16.3 — this project is on 16.3.6) re-runs the
 * failed render in place; `reset` also still works but the docs now steer
 * new code at `retry`. There's no error-reporting service wired up to send
 * this to (Brief scope — see ARCHITECTURE.md "Open decisions" > Monitoring),
 * so this only logs to the console, the same as the framework's own
 * default fallback did.
 *
 * Error boundaries must be Client Components, which also rules out a
 * `metadata` export here (see the file-conventions doc's "Global Errors"
 * note) — React 19's own `<title>` is the documented alternative.
 */
export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
      <title>Something went wrong — Bekvor</title>
      <p className="text-sm font-semibold text-t2">Error</p>
      <h1 className="mt-2 font-display text-[1.75rem] leading-[1.1] font-extrabold tracking-[-0.03em] text-tx">Something went wrong</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-t2">
        That&rsquo;s on us — this page hit an unexpected error. Trying again usually fixes it.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-6 rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
      >
        Try again
      </button>
    </main>
  );
}
