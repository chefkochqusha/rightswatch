"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import {
  createCampaignAction,
  deleteCampaignAction,
  renameCampaignAction,
  setCreatorOnCampaignAction,
  type CampaignActionState,
} from "./actions";

const INPUT = "block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-tx";

function Message({ state }: { state: CampaignActionState }) {
  if (state.error) return <p role="alert" className="mt-1.5 text-[0.8125rem] text-mismatch">{state.error}</p>;
  if (state.done) return <p role="status" className="mt-1.5 text-[0.8125rem] text-cleared">{state.done}</p>;
  return null;
}

/** The "new campaign" form; clears itself after it worked. */
export function CreateCampaign() {
  const [state, action, pending] = useActionState(createCampaignAction, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.done) form.current?.reset();
  }, [state]);
  return (
    <ActionForm ref={form} action={action} className="max-w-xl">
      <label htmlFor="campaign-name" className="block text-[0.8125rem] font-medium text-tx">Name</label>
      <div className="mt-1.5 flex gap-2">
        <input id="campaign-name" name="name" required maxLength={80} placeholder="e.g. Summer launch 2026" className={INPUT} />
        <button type="submit" disabled={pending} className={buttonStyles("primary", "md")}>
          {pending ? "Creating…" : "Create"}
        </button>
      </div>
      <Message state={state} />
    </ActionForm>
  );
}

export function RenameCampaign({ campaignId, name }: { campaignId: string; name: string }) {
  const [state, action, pending] = useActionState(renameCampaignAction, {});
  const [open, setOpen] = useState(false);
  if (!open || state.done) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonStyles("secondary", "sm")}>
        Rename<span className="sr-only"> {name}</span>
      </button>
    );
  }
  return (
    <ActionForm action={action} className="w-full max-w-md">
      <input type="hidden" name="campaignId" value={campaignId} />
      <label htmlFor={`rename-${campaignId}`} className="sr-only">New name for {name}</label>
      <div className="flex gap-2">
        <input id={`rename-${campaignId}`} name="name" defaultValue={name} required maxLength={80} className={INPUT} autoFocus />
        <button type="submit" disabled={pending} className={buttonStyles("primary", "sm")}>{pending ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => setOpen(false)} className={buttonStyles("secondary", "sm")}>Cancel</button>
      </div>
      <Message state={state} />
    </ActionForm>
  );
}

/** Deleting, after a second click that says what it does. */
export function DeleteCampaign({ campaignId, name, creators }: { campaignId: string; name: string; creators: number }) {
  const [state, action, pending] = useActionState(deleteCampaignAction, {});
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={buttonStyles("danger", "sm")}>
        Delete<span className="sr-only"> {name}</span>
      </button>
    );
  }
  return (
    <form action={action} className="w-full max-w-md">
      <input type="hidden" name="campaignId" value={campaignId} />
      <p className="text-[0.8125rem] text-t2">
        {creators > 0 ? `The ${creators === 1 ? "creator stays" : `${creators} creators stay`} on your watchlist; only the campaign goes.` : "Nobody is on it."}{" "}
        Their posts and cases stay.
      </p>
      <div className="mt-2 flex gap-2">
        <button type="submit" disabled={pending} className={buttonStyles("danger", "sm")}>{pending ? "Deleting…" : "Delete campaign"}</button>
        <button type="button" onClick={() => setConfirming(false)} className={buttonStyles("secondary", "sm")}>Keep it</button>
      </div>
      <Message state={state} />
    </form>
  );
}

export function AddCreator({ campaignId, name, options }: { campaignId: string; name: string; options: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(setCreatorOnCampaignAction, {});
  return (
    <ActionForm action={action}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="on" value="true" />
      <label htmlFor={`add-${campaignId}`} className="sr-only">Creator to add to {name}</label>
      <div className="flex flex-wrap gap-2">
        <select id={`add-${campaignId}`} name="creatorId" defaultValue="" className={`${INPUT} w-auto min-w-0 max-w-full`}>
          <option value="" disabled>Choose a creator…</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={buttonStyles("secondary", "sm")}>
          {pending ? "Adding…" : "Add"}<span className="sr-only"> to {name}</span>
        </button>
      </div>
      <Message state={state} />
    </ActionForm>
  );
}

export function RemoveCreator({ campaignId, creatorId, label, campaignName }: { campaignId: string; creatorId: string; label: string; campaignName: string }) {
  const [state, action, pending] = useActionState(setCreatorOnCampaignAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="creatorId" value={creatorId} />
      <input type="hidden" name="on" value="false" />
      <button type="submit" disabled={pending} className={buttonStyles("secondary", "sm")}>
        {pending ? "Taking off…" : "Take off"}<span className="sr-only"> {label} from {campaignName}</span>
      </button>
      <Message state={state} />
    </form>
  );
}
