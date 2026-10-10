"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { signUpAction, type SignUpFormState } from "./actions";

const initialState: SignUpFormState = {};

export function SignUpForm({ partnerCode }: { partnerCode?: string | null }) {
  const [state, formAction, pending] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {partnerCode && <input type="hidden" name="ref" value={partnerCode} />}
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
      <div>
        <label className="flex items-start gap-3 text-[0.8125rem] leading-snug text-t2">
          <input type="checkbox" name="confirmBusiness" required aria-invalid={state.fieldErrors?.confirmBusiness ? true : undefined} className="mt-0.5 h-4 w-4 shrink-0 accent-accent" />
          <span>I&apos;m signing up for a business or professional purpose, and I&apos;m at least 18 years old.</span>
        </label>
        {state.fieldErrors?.confirmBusiness && (
          <p role="alert" className="mt-1.5 text-[0.8125rem] text-mismatch">
            {state.fieldErrors.confirmBusiness}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-full bg-accent px-4 text-[0.9375rem] font-medium text-accent-fg transition-[transform,background-color] duration-100 ease-out hover:bg-accent-strong active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Creating workspace…" : "Create workspace"}
      </button>
    </form>
  );
}
