"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Error boundary for the app's pages: a failure on one page (a database
 * hiccup, say) keeps the navigation around it, so the person can retry or
 * move to another section instead of losing the whole window.
 */
export default function WorkspaceError({
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
    <div className="py-16 text-center">
      <title>Something went wrong — RightsWatch</title>
      <p className="text-sm font-semibold text-t2">Error</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-tx">Something went wrong</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-t2">
        That&rsquo;s on us — this page hit an unexpected error. Trying again usually fixes it.
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
        >
          Try again
        </button>
        <Link href="/workspace" className="text-sm font-medium text-t2 hover:text-tx">
          Back to overview
        </Link>
      </div>
    </div>
  );
}
