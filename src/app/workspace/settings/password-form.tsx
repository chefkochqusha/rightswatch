"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { changePasswordAction, type ChangePasswordFormState } from "./actions";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, {} as ChangePasswordFormState);

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <FormField label="Current password" name="current" type="password" autoComplete="current-password" />
      <FormField label="New password" name="next" type="password" placeholder="At least 8 characters" autoComplete="new-password" />
      <FormField label="New password again" name="confirm" type="password" autoComplete="new-password" />
      {state.formError && (
        <p role="alert" className="text-[0.8125rem] text-mismatch">
          {state.formError}
        </p>
      )}
      {state.done && (
        <p role="status" className="text-[0.8125rem] text-cleared">
          Password changed. You were signed out everywhere else.
        </p>
      )}
      <button type="submit" disabled={pending} className="rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg transition hover:opacity-90 disabled:opacity-60">
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
