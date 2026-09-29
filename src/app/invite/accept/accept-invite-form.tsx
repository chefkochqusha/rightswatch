"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { acceptInviteAction, type AcceptInviteFormState } from "./actions";

const initialState: AcceptInviteFormState = {};

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptInviteAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormField label="Your name" name="name" placeholder="Jane Doe" optional autoComplete="name" />
      <FormField
        label="Password"
        name="password"
        type="password"
        placeholder="At least 8 characters"
        error={state.fieldErrors?.password}
        autoComplete="new-password"
      />
      {state.formError && <p className="text-[0.8125rem] text-mismatch">{state.formError}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-tx px-4 py-2.5 text-sm font-medium text-bg transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Joining…" : "Join workspace"}
      </button>
    </form>
  );
}
