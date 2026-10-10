"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Handles an error thrown by the root layout itself (`layout.tsx`) —
 * `error.tsx` can't catch that, since it doesn't wrap the layout above it
 * in the same segment (Next.js App Router `error.js` convention, "Global
 * Errors" — see `node_modules/next/dist/docs/.../file-conventions/error.md`).
 * This replaces the entire document when active, so unlike `error.tsx` it
 * defines its own `<html>`/`<body>` and imports global styles directly —
 * nothing from `layout.tsx` renders around it, including its `<html>` tag
 * or its metadata.
 *
 * In practice `layout.tsx` is about as simple as a root layout gets (no
 * data fetching, no provider that can throw), so this is a safety net for
 * a case expected to stay rare rather than a page anyone should actually
 * see.
 */
export default function GlobalError({
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
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center bg-bg px-6 text-center text-tx">
        <main>
        <title>Something went wrong — Bekvor</title>
        <p className="text-sm font-semibold text-t2">Error</p>
        <h1 className="mt-2 font-display text-[1.75rem] leading-[1.1] font-extrabold tracking-[-0.03em]">Something went wrong</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-t2">
          That&rsquo;s on us — the app hit an unexpected error. Trying again usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
        >
          Try again
        </button>
        </main>
      </body>
    </html>
  );
}
