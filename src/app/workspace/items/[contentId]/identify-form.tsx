"use client";

import { useActionState } from "react";
import { identifySongAction, type IdentifyFormState } from "./identify-actions";

/** Pick which of the library's songs a post uses. */
export function IdentifyForm({ contentId, songs }: { contentId: string; songs: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(identifySongAction, {} as IdentifyFormState);

  return (
    <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="contentId" value={contentId} />
      <div className="min-w-56 flex-1">
        <label htmlFor="trackId" className="block text-[0.8125rem] font-medium text-tx">
          Song in this post
        </label>
        <select
          id="trackId"
          name="trackId"
          defaultValue=""
          className="mt-1 block h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-tx"
        >
          <option value="" disabled>
            Choose a song from your library
          </option>
          {songs.map((song) => (
            <option key={song.id} value={song.id}>
              {song.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-full bg-tx px-4 text-sm font-medium text-bg transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Checking…" : "Identify song and check rights"}
      </button>
      {state.error && (
        <p role="alert" className="w-full text-[0.8125rem] text-mismatch">
          {state.error}
        </p>
      )}
    </form>
  );
}
