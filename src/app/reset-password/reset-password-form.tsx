"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { resetPasswordAction, type ResetPasswordFormState } from "./actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, {} as ResetPasswordFormState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormField label="New password" name="password" type="password" placeholder="At least 8 characters" autoComplete="new-password" />
      <FormField label="New password again" name="confirm" type="password" autoComplete="new-password" />
      {state.formError && (
        <p role="alert" className="text-[0.8125rem] text-mismatch">
          {state.formError}{" "}
          {state.formError.startsWith("This link") && (
            <Link href="/forgot-password" className="font-medium underline">
              Get a new link
            </Link>
          )}
        </p>
      )}
      <button type="submit" disabled={pending} className="w-full rounded-full bg-tx px-4 py-2.5 text-sm font-medium text-bg transition hover:opacity-90 disabled:opacity-60">
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
