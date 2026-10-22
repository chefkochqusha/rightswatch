"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormField } from "@/components/ui/form-field";
import { buttonStyles } from "@/components/ui/button";
import { CountrySelect, type CountryOption } from "@/components/creators/country-select";
import { addCreatorAction, type CreatorFormState } from "./actions";

const initialState: CreatorFormState = {};

/**
 * Adds a creator to the watchlist (Brief §8): their platform and username —
 * typed as "@name", "name" or pasted as a profile link. On success the form
 * clears for the next one and says who was added.
 */
export function AddCreatorForm({ countries }: { countries: CountryOption[] }) {
  const [state, formAction, pending] = useActionState(addCreatorAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.added) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[0.8fr_1.4fr_1.2fr_1fr_0.8fr]">
        <div>
          <label htmlFor="platform" className="block text-[0.8125rem] font-medium text-tx">
            Platform
          </label>
          <select
            id="platform"
            name="platform"
            defaultValue="TIKTOK"
            aria-invalid={state.fieldErrors?.platform ? true : undefined}
            aria-describedby={state.fieldErrors?.platform ? "platform-error" : undefined}
            className="mt-1.5 block w-full min-w-0 rounded-lg border border-line bg-bg px-3 py-2 text-sm text-tx aria-invalid:border-mismatch"
          >
            <option value="TIKTOK">TikTok</option>
            <option value="INSTAGRAM">Instagram</option>
          </select>
          {state.fieldErrors?.platform && (
            <p id="platform-error" className="mt-1.5 text-[0.8125rem] text-mismatch">
              {state.fieldErrors.platform}
            </p>
          )}
        </div>
        <FormField
          label="Username"
          name="username"
          placeholder="@lena.creates"
          autoComplete="off"
          hint="Or paste a link to their profile."
          error={state.fieldErrors?.username}
        />
        <FormField
          label="Display name"
          name="displayName"
          optional
          autoComplete="off"
          maxLength={80}
          error={state.fieldErrors?.displayName}
        />
        <CountrySelect options={countries} error={state.fieldErrors?.country} />
        <FormField
          label="Followers"
          name="followerCount"
          optional
          placeholder="182K"
          inputMode="numeric"
          autoComplete="off"
          error={state.fieldErrors?.followerCount}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={pending} className={buttonStyles("primary")}>
          {pending ? "Adding…" : "Add creator"}
        </button>
        <p role="status" className="text-[0.8125rem]">
          {state.formError ? (
            <span className="text-mismatch">{state.formError}</span>
          ) : state.added ? (
            <span className="text-t2">
              @{state.added}
              {state.addedPlatform ? ` on ${state.addedPlatform}` : ""}{" "}
              {state.restored ? "is back on your watchlist." : "is on your watchlist. The next scan includes them."}
            </span>
          ) : null}
        </p>
      </div>
    </form>
  );
}
