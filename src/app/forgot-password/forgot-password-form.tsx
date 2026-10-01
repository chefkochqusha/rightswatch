"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { forgotPasswordAction, type ForgotPasswordState } from "./actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, {} as ForgotPasswordState);

  if (state.done) {
    return (
      <div className="space-y-4 text-sm leading-relaxed">
        {state.noEmail ? (
          <p className="text-t2">Email sending isn&apos;t set up on this server yet, so no email was sent. Ask the person who runs this workspace to reset your password.</p>
        ) : (
          <p className="text-t2">If an account exists for that email, a link to set a new password is on its way. It works for one hour.</p>
        )}
        {state.devLink && (
          <p className="rounded-lg bg-hover p-3 text-[0.8125rem] break-all">
            <span className="block font-medium text-tx">Development: no email is sent here, so this is the link.</span>
            <a href={state.devLink} className="text-accent hover:underline">{state.devLink}</a>
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormField label="Email" name="email" type="email" placeholder="jane@acme.com" autoComplete="email" />
      <button type="submit" disabled={pending} className="w-full rounded-full bg-tx px-4 py-2.5 text-sm font-medium text-bg transition hover:opacity-90 disabled:opacity-60">
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
