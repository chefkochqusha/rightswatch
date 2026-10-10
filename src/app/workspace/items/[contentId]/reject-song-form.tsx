"use client";

import { useActionState } from "react";
import { rejectSongAction, type RejectFormState } from "./identify-actions";

/**
 * "Wrong song?" — withdraws the identification after a second step, with an
 * optional note for the case history. The post then has no song again.
 */
export function RejectSongForm({ contentId, title, hasCase }: { contentId: string; title: string; hasCase: boolean }) {
  const [state, action, pending] = useActionState(rejectSongAction, {} as RejectFormState);
  return (
    <details className="group mt-3 text-sm">
      <summary className="cursor-pointer text-[0.8125rem] text-t2 underline underline-offset-2 hover:text-tx">Wrong song?</summary>
      <form action={action} className="mt-3 space-y-3 rounded-lg border border-line bg-bg p-4">
        <input type="hidden" name="contentId" value={contentId} />
        <p>
          Withdraw “{title}” from this post. The post then has no song, and you can identify the right one.
          {hasCase ? " If it has a case, the case is dismissed, with a note saying why." : ""}
        </p>
        <div>
          <label htmlFor="reject-note" className="block text-[0.8125rem] font-medium">
            Note <span className="font-normal text-t2">(optional)</span>
          </label>
          <textarea id="reject-note" name="note" rows={2} maxLength={500} className="mt-1 block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
        </div>
        <button type="submit" disabled={pending} className="h-9 rounded-full border border-mismatch px-4 text-sm font-medium text-mismatch transition hover:bg-mismatch/10 disabled:opacity-60">
          {pending ? "Withdrawing…" : "Withdraw this song"}
        </button>
        {state.error && <p role="alert" className="text-[0.8125rem] text-mismatch">{state.error}</p>}
      </form>
    </details>
  );
}
