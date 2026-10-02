"use client";

import { useActionState } from "react";
import { resendVerificationAction, type ResendState } from "@/app/workspace/verify-actions";

/** Asks the person to confirm their email. Never blocks anything. */
export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, action, pending] = useActionState(async () => resendVerificationAction(), {} as ResendState);
  return (
    <aside aria-label="Email confirmation" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-review-bg px-4 py-2 text-[0.8125rem] text-review md:px-10">
      <p>
        Please confirm <span className="font-medium">{email}</span>. We sent you a link.
        {state.message && <span className="ml-2 text-tx">{state.message}</span>}
      </p>
      <form action={action}>
        <button type="submit" disabled={pending} className="font-medium underline disabled:opacity-60">
          {pending ? "Sending…" : "Send it again"}
        </button>
      </form>
    </aside>
  );
}
