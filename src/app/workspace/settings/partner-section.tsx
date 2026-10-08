"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { joinPartnerAction, type JoinPartnerFormState } from "./actions";

export function JoinPartnerForm() {
  const [state, formAction, pending] = useActionState(joinPartnerAction, {} as JoinPartnerFormState);
  return (
    <form action={formAction} className="space-y-3">
      <label className="flex items-start gap-3 text-[0.8125rem] leading-snug text-t2">
        <input type="checkbox" name="acceptTerms" required className="mt-0.5 h-4 w-4 shrink-0 accent-accent" />
        <span>
          I accept the{" "}
          <Link href="/partner-terms" target="_blank" className="text-accent underline underline-offset-2">
            partner terms
          </Link>
          , including labelling my link as advertising.
        </span>
      </label>
      {state.formError && (
        <p role="alert" className="text-[0.8125rem] text-mismatch">
          {state.formError}
        </p>
      )}
      <button type="submit" disabled={pending} className="rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60">
        {pending ? "Joining…" : "Get my partner link"}
      </button>
    </form>
  );
}

export function PartnerLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="max-w-full truncate rounded-md border border-line bg-surface-2 px-3 py-1.5 text-[0.8125rem] text-tx">{link}</code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
        className="rounded-full border border-line px-3 py-1.5 text-[0.8125rem] font-medium text-t2 hover:bg-hover hover:text-tx"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
