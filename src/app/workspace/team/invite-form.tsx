"use client";

import { useActionState, useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { inviteTeammateAction, type InviteTeammateFormState } from "./actions";

const initialState: InviteTeammateFormState = {};

const ROLE_OPTIONS: { value: "ANALYST" | "ADMIN" | "VIEWER"; label: string }[] = [
  { value: "ANALYST", label: "Analyst — reviews cases" },
  { value: "ADMIN", label: "Admin — full access" },
  { value: "VIEWER", label: "Viewer — read-only" },
];

function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard API can be unavailable (e.g. an insecure context) —
          // the input beside this button is still selectable by hand.
        }
      }}
      className="shrink-0 rounded-md border border-line px-3 py-2 text-[0.8125rem] font-medium text-t2 hover:bg-hover hover:text-tx"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

/**
 * Invite form for `/workspace/team`. Only ever rendered for an OWNER/ADMIN
 * session (see `page.tsx`), but `actions.ts`'s `requireAdmin` is the real
 * guard — this component doesn't re-check the role itself.
 *
 * When this server sends email, the invite is emailed; the link is shown
 * either way, to copy and send by hand if the email doesn't arrive.
 */
export function InviteForm() {
  const [state, formAction, pending] = useActionState(inviteTeammateAction, initialState);

  // `window` is only available once this renders on the client. A JS-enabled
  // submission never actually needs the fallback below — `useActionState`
  // updates this component in place, so by the time `issuedToken` is set
  // we're already running client-side. The relative-path fallback only
  // matters for a no-JS form post, where Next re-renders the whole page
  // server-side with the posted-back state (`window` genuinely doesn't
  // exist there) — see `case-panel.tsx`'s doc comment on why this app cares
  // about that path working at all.
  const hasOrigin = typeof window !== "undefined";
  const inviteLink = state.issuedToken
    ? `${hasOrigin ? window.location.origin : ""}/invite/accept?token=${state.issuedToken}`
    : null;

  return (
    <div>
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <FormField
            label="Email"
            name="email"
            type="email"
            placeholder="teammate@acme.com"
            error={state.fieldErrors?.email}
            autoComplete="off"
          />
        </div>
        <div className="sm:w-64">
          <label htmlFor="role" className="block text-[0.8125rem] font-medium text-tx">
            Role
          </label>
          <select
            id="role"
            name="role"
            defaultValue="ANALYST"
            className="mt-1.5 block w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-tx"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {state.fieldErrors?.role && (
            <p className="mt-1.5 text-[0.8125rem] text-mismatch">{state.fieldErrors.role}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-full bg-tx px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60 sm:mt-6"
        >
          {pending ? "Sending…" : "Send invite"}
        </button>
      </form>

      {state.formError && <p className="mt-3 text-[0.8125rem] text-mismatch">{state.formError}</p>}

      {inviteLink && (
        <div className="mt-4 rounded-md border border-line bg-surface-2 p-3">
          <p className="text-[0.8125rem] text-tx">
            {state.emailed ? (
              <>
                We emailed the invite to <strong>{state.invitedEmail}</strong>. If it doesn&apos;t arrive, send them this link yourself.
                It works for 7 days:
              </>
            ) : (
              <>
                Invite created for <strong>{state.invitedEmail}</strong>. Copy this link and send it to them yourself. It works for 7
                days:
              </>
            )}
          </p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={inviteLink}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Invite link"
              className="w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-[0.75rem] text-tx"
            />
            {hasOrigin && <CopyLinkButton link={inviteLink} />}
          </div>
        </div>
      )}
    </div>
  );
}
