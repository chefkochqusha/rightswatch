"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { joinWaitlistAction, type WaitlistFormState } from "./waitlist-actions";

const initialState: WaitlistFormState = {};
const BUTTON =
  "h-11 w-full rounded-full bg-accent px-4 text-[0.9375rem] font-medium text-accent-fg transition-[transform,background-color] duration-100 ease-out hover:bg-accent-strong active:scale-[0.98] disabled:opacity-60";

/**
 * The waitlist form (double opt-in): an address, optionally the company, and
 * two boxes nobody ticks for you. `consentText` is the wording stored with
 * every entry as proof, so the form shows exactly that text.
 */
export function WaitlistForm({ consentText }: { consentText: string }) {
  const [state, formAction, pending] = useActionState(joinWaitlistAction, initialState);

  if (state.done) {
    return (
      <div role="status" className="space-y-3 text-sm text-tx">
        <p className="font-medium">Check your inbox.</p>
        <p className="text-t2">
          We sent a link to confirm your address. Once you click it, you&apos;re on the waitlist. Without a confirmation, the address is deleted after
          7 days.
        </p>
        {state.devLink && (
          <p className="text-t2">
            Development only, no email provider: <a href={state.devLink} className="font-medium text-accent underline">confirmation link</a>
          </p>
        )}
      </div>
    );
  }

  return (
    <form key={state.attempt ?? 0} action={formAction} className="space-y-4">
      <FormField label="Work email" name="email" type="email" placeholder="jane@acme.com" defaultValue={state.values?.email} error={state.fieldErrors?.email} autoComplete="email" />
      <FormField label="Company" name="company" placeholder="Acme Records" optional autoComplete="organization" maxLength={120} defaultValue={state.values?.company} error={state.fieldErrors?.company} />
      <Checkbox name="business" defaultChecked={state.values?.business} error={state.fieldErrors?.business}>
        I&apos;m joining for a business or professional purpose, and I&apos;m at least 18 years old.
      </Checkbox>
      <Checkbox name="consent" defaultChecked={state.values?.consent} error={state.fieldErrors?.consent}>
        {consentText}
      </Checkbox>
      <p className="text-[0.8125rem] text-t2">
        How we handle your address:{" "}
        <Link href="/privacy" className="font-medium text-accent hover:underline">
          privacy policy
        </Link>
        .
      </p>
      {state.formError && (
        <p role="alert" className="text-[0.8125rem] text-mismatch">
          {state.formError}
        </p>
      )}
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Sending…" : "Join the waitlist"}
      </button>
    </form>
  );
}

function Checkbox({ name, defaultChecked, error, children }: { name: string; defaultChecked?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-start gap-3 text-[0.8125rem] leading-snug text-t2">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${name}-error` : undefined}
          className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
        />
        <span>{children}</span>
      </label>
      {error && (
        <p id={`${name}-error`} role="alert" className="mt-1.5 text-[0.8125rem] text-mismatch">
          {error}
        </p>
      )}
    </div>
  );
}
