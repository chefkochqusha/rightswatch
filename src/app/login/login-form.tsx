"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { logInAction, type LogInFormState } from "./actions";

const initialState: LogInFormState = {};

export function LogInForm() {
  const [state, formAction, pending] = useActionState(logInAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormField
        label="Email"
        name="email"
        type="email"
        placeholder="jane@acme.com"
        autoComplete="email"
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        placeholder="Your password"
        autoComplete="current-password"
      />
      {state.formError && <p className="text-[0.8125rem] text-mismatch">{state.formError}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-tx px-4 py-2.5 text-sm font-medium text-bg transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
