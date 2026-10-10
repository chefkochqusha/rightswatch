"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Reloads the page's server data every few seconds while it is rendered.
 * A page renders it only while something runs in the background (a scan,
 * an upload being processed), so it stops by itself when that is done.
 */
export function AutoRefresh({ everyMs = 4_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
