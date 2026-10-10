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
        className="h-11 w-full rounded-full bg-accent px-4 text-[0.9375rem] font-medium text-accent-fg transition-[transform,background-color] duration-100 ease-out hover:bg-accent-strong active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Joining…" : "Join workspace"}
      </button>
    </form>
  );
}
