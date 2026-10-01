"use client";

import { useActionState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { addCreatorAction, type CreatorFormState } from "../actions";

const initialState: CreatorFormState = {};

/** Puts a removed creator back on the watchlist — the same as adding the
 *  username again, which restores this record rather than making a new one. */
export function RestoreForm({ handle }: { handle: string }) {
  const [state, formAction, pending] = useActionState(addCreatorAction, initialState);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="username" value={handle} />
      <button type="submit" disabled={pending} className={buttonStyles("primary", "sm")}>
        {pending ? "Adding…" : "Add back to watchlist"}
      </button>
      {state.formError && <p className="text-[0.8125rem] text-mismatch">{state.formError}</p>}
      {state.fieldErrors?.username && <p className="text-[0.8125rem] text-mismatch">{state.fieldErrors.username}</p>}
    </form>
  );
}
