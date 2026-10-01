"use client";

import { useActionState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { FormField } from "@/components/ui/form-field";
import { buttonStyles } from "@/components/ui/button";
import { updateSongDetailsAction, type SongDetailsState } from "../actions";

/** Brief §10's catalogue fields for a song: catalogue ID, rights owner,
 *  publisher, label and notes. All optional; an emptied field is cleared. */
export function SongDetailsForm({
  trackId,
  details,
}: {
  trackId: string;
  details: { catalogueId: string | null; rightsOwner: string | null; publisher: string | null; label: string | null; notes: string | null };
}) {
  const [state, formAction, pending] = useActionState<SongDetailsState, FormData>(updateSongDetailsAction, {});

  return (
    <ActionForm action={formAction} className="space-y-4">
      <input type="hidden" name="trackId" value={trackId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Catalogue ID" name="catalogueId" id="detail-catalogue-id" optional defaultValue={details.catalogueId ?? ""} maxLength={200} autoComplete="off" />
        <FormField label="Rights owner" name="rightsOwner" id="detail-rights-owner" optional defaultValue={details.rightsOwner ?? ""} maxLength={200} autoComplete="off" />
        <FormField label="Publisher" name="publisher" id="detail-publisher" optional defaultValue={details.publisher ?? ""} maxLength={200} autoComplete="off" />
        <FormField label="Label" name="label" id="detail-label" optional defaultValue={details.label ?? ""} maxLength={200} autoComplete="off" />
      </div>
      <div>
        <label htmlFor="detail-notes" className="block text-[0.8125rem] font-medium text-tx">
          Notes <span className="font-normal text-t2">(optional)</span>
        </label>
        <textarea
          id="detail-notes"
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={details.notes ?? ""}
          className="mt-1.5 block w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonStyles("secondary")}>
          {pending ? "Saving…" : "Save details"}
        </button>
        <p role="status" className="text-[0.8125rem]">
          {state.error ? <span className="text-mismatch">{state.error}</span> : state.saved ? <span className="text-t2">Saved.</span> : null}
        </p>
      </div>
    </ActionForm>
  );
}
