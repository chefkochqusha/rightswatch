"use client";

import Link from "next/link";
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
      <p className="text-[0.8125rem]">
        <Link href="/forgot-password" className="text-t2 hover:text-tx hover:underline">
          Forgot your password?
        </Link>
      </p>
      {state.formError && <p className="text-[0.8125rem] text-mismatch">{state.formError}</p>}
      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-full bg-accent px-4 text-[0.9375rem] font-medium text-accent-fg transition-[transform,background-color] duration-100 ease-out hover:bg-accent-strong active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
