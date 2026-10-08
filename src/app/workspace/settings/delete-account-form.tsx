"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { deleteAccountAction, type DeleteAccountFormState } from "./actions";

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, {} as DeleteAccountFormState);

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <FormField label="Your password" name="password" type="password" autoComplete="current-password" />
      {state.formError && (
        <p role="alert" className="text-[0.8125rem] text-mismatch">
          {state.formError}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-mismatch px-4 py-2 text-sm font-medium text-bg transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete my account for good"}
      </button>
    </form>
  );
}
