"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { buttonStyles } from "@/components/ui/button";
import { CountrySelect, type CountryOption } from "@/components/creators/country-select";
import { updateCreatorDetailsAction, type CreatorFormState } from "../actions";

const initialState: CreatorFormState = {};

/** Display name, country and followers — what a member records about a
 *  creator (Brief §8). The country matters most: it's the territory
 *  signal for this creator's posts. */
export function EditDetailsForm({
  creatorId,
  displayName,
  country,
  followerCount,
  countries,
}: {
  countries: CountryOption[];
  creatorId: string;
  displayName: string | null;
  country: string | null;
  followerCount: number | null;
}) {
  const [state, formAction, pending] = useActionState(updateCreatorDetailsAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="creatorId" value={creatorId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          label="Display name"
          name="displayName"
          id="edit-displayName"
          optional
          defaultValue={displayName ?? ""}
          maxLength={80}
          autoComplete="off"
          error={state.fieldErrors?.displayName}
        />
        <CountrySelect options={countries} id="edit-country" defaultValue={country} error={state.fieldErrors?.country} />
        <FormField
          label="Followers"
          name="followerCount"
          id="edit-followerCount"
          optional
          inputMode="numeric"
          defaultValue={followerCount === null ? "" : String(followerCount)}
          autoComplete="off"
          error={state.fieldErrors?.followerCount}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={pending} className={buttonStyles("secondary")}>
          {pending ? "Saving…" : "Save details"}
        </button>
        <p role="status" className="text-[0.8125rem]">
          {state.formError ? (
            <span className="text-mismatch">{state.formError}</span>
          ) : state.saved ? (
            <span className="text-t2">Saved. The next scan uses the new country.</span>
          ) : null}
        </p>
      </div>
    </form>
  );
}
