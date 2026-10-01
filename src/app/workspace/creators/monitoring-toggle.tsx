"use client";

import { useActionState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { pauseCreatorAction, resumeCreatorAction, type CreatorFormState } from "./actions";

const initialState: CreatorFormState = {};

/**
 * Pause or resume one creator's monitoring (Brief §8). Resuming can be
 * refused — the plan's creator limit (§19) — so it reports back in place.
 */
export function MonitoringToggle({ creatorId, monitoring }: { creatorId: string; monitoring: boolean }) {
  const [state, resumeAction, pending] = useActionState(resumeCreatorAction, initialState);

  if (monitoring) {
    return (
      <form action={pauseCreatorAction}>
        <input type="hidden" name="creatorId" value={creatorId} />
        <button type="submit" className={buttonStyles("secondary", "sm")}>
          Pause
        </button>
      </form>
    );
  }

  return (
    <form action={resumeAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="creatorId" value={creatorId} />
      <button type="submit" disabled={pending} className={buttonStyles("secondary", "sm")}>
        {pending ? "Resuming…" : "Resume"}
      </button>
      {state.formError && <p className="max-w-56 text-right text-xs text-mismatch">{state.formError}</p>}
    </form>
  );
}
