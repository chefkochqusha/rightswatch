"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { signUpAction, type SignUpFormState } from "./actions";

const initialState: SignUpFormState = {};

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormField
        label="Workspace name"
        name="workspaceName"
        placeholder="Acme Records"
        error={state.fieldErrors?.workspaceName}
      />
      <FormField
        label="Your name"
        name="name"
        placeholder="Jane Doe"
        optional
        autoComplete="name"
      />
      <FormField
        label="Email"
        name="email"
        type="email"
        placeholder="jane@acme.com"
        error={state.fieldErrors?.email}
        autoComplete="email"
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        placeholder="At least 8 characters"
        error={state.fieldErrors?.password}
        autoComplete="new-password"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-tx px-4 py-2.5 text-sm font-medium text-bg transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Creating workspace…" : "Create workspace"}
      </button>
    </form>
  );
}
