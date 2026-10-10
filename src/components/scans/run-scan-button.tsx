"use client";

import { useActionState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { runScanAction, type ScanActionState } from "@/app/workspace/scan-actions";

const initialState: ScanActionState = { status: "idle" };

/**
 * "Run scan" (Brief §50), with what happened in words rather than a
 * spinner (§35): how many creators it's scanning while it runs, then what
 * it found.
 */
export function RunScanButton({ creatorCount }: { creatorCount: number }) {
  const [state, formAction, pending] = useActionState(runScanAction, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button type="submit" disabled={pending} className={buttonStyles("primary")}>
        {pending ? "Scanning…" : "Run scan"}
      </button>
      <p role="status" aria-live="polite" className="text-[0.8125rem] text-t2">
        {pending ? (
          `Scanning ${creatorCount} ${creatorCount === 1 ? "creator" : "creators"}…`
        ) : state.status === "error" ? (
          <span className="text-mismatch">{state.message}</span>
        ) : state.status === "done" ? (
          summary(state)
        ) : state.status === "queued" ? (
          state.alreadyQueued
            ? "A scan is already on its way. Results appear on this page when it's done."
            : "Scan started. It runs in the background; results appear on this page when it's done."
        ) : null}
      </p>
    </form>
  );
}

function summary(state: Extract<ScanActionState, { status: "done" }>): string {
  const parts = [
    `${state.videos} ${state.videos === 1 ? "video" : "videos"} checked`,
    state.newMatches === 0 ? "no new matches" : `${state.newMatches} new ${state.newMatches === 1 ? "match" : "matches"}`,
  ];
  if (state.casesOpened > 0) parts.push(`${state.casesOpened} new ${state.casesOpened === 1 ? "case" : "cases"}`);
  let text = `Scan complete: ${parts.join(", ")}.`;
  if (state.failedCreators > 0) {
    text += ` ${state.failedCreators} ${state.failedCreators === 1 ? "creator" : "creators"} couldn't be fetched.`;
  }
  if (state.skippedOverLimit > 0) text += ` ${state.skippedOverLimit} over your plan's limit weren't scanned.`;
  return text;
}
