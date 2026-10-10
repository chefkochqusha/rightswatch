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
      <button type="submit" disabled={pending} className="h-11 w-full rounded-full bg-accent px-4 text-[0.9375rem] font-medium text-accent-fg transition-[transform,background-color] duration-100 ease-out hover:bg-accent-strong active:scale-[0.98] disabled:opacity-60">
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
