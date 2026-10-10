"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { buttonStyles } from "@/components/ui/button";
import { addPostAction, type AddPostState } from "./actions";

export function AddPostForm({ creators, today }: { creators: { id: string; handle: string }[]; today: string }) {
  const [state, formAction, pending] = useActionState(addPostAction, {} as AddPostState);
  const creatorError = state.fieldErrors?.creatorId;
  const v = state.values;

  return (
    <form key={state.attempt ?? 0} action={formAction} className="max-w-2xl space-y-5">
      <div>
        <label htmlFor="creatorId" className="block text-[0.8125rem] font-medium text-tx">
          Creator
        </label>
        <select
          id="creatorId"
          name="creatorId"
          required
          defaultValue={v?.creatorId ?? ""}
          aria-invalid={creatorError ? true : undefined}
          aria-describedby={creatorError ? "creatorId-error" : undefined}
          className="mt-1.5 block h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-tx aria-invalid:border-mismatch"
        >
          <option value="" disabled>
            Choose from your watchlist
          </option>
          {creators.map((creator) => (
            <option key={creator.id} value={creator.id}>
              @{creator.handle}
            </option>
          ))}
        </select>
        {creatorError && (
          <p id="creatorId-error" className="mt-1.5 text-[0.8125rem] text-mismatch">
            {creatorError}
          </p>
        )}
      </div>
      <FormField
        label="Link to the post"
        name="url"
        type="url"
        placeholder="https://www.tiktok.com/@name/video/7301234567890123456"
        autoComplete="off"
        hint="The full link from the address bar or the share menu's “Copy link”."
        defaultValue={v?.url}
        error={state.fieldErrors?.url}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Published on" name="publishedOn" type="date" defaultValue={v?.publishedOn ?? today} error={state.fieldErrors?.publishedOn} />
        <FormField
          label="Country"
          name="territory"
          optional
          placeholder="DE"
          maxLength={2}
          autoComplete="off"
          hint="Where the post ran, if you know it."
          error={state.fieldErrors?.territory}
        />
      </div>
      <FormField
        label="Brands"
        name="brands"
        optional
        placeholder="Glow Cosmetics, Fizz"
        autoComplete="off"
        hint="Separated by commas, as the post names them."
        defaultValue={v?.brands}
        error={state.fieldErrors?.brands}
      />
      <FormField label="Label on the post" name="label" optional placeholder="Paid partnership" autoComplete="off" maxLength={60} defaultValue={v?.label} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={pending} className={buttonStyles("primary")}>
          {pending ? "Adding…" : "Add post"}
        </button>
        <p role="status" className="text-[0.8125rem]">
          {state.formError && <span className="text-mismatch">{state.formError}</span>}{" "}
          {state.existing && (
            <Link href={`/workspace/items/${state.existing}`} className="font-medium text-accent underline underline-offset-2">
              Open it
            </Link>
          )}
        </p>
      </div>
    </form>
  );
}
