import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { getSessionSecret } from "@/app/_lib/session-cookie";
import { verifyInviteToken } from "@/modules/auth";
import { AcceptInviteForm } from "./accept-invite-form";

export const metadata = {
  title: "Accept invite — Bekvor",
};

const LOG_IN_FOOTER = (
  <>
    Already have an account?{" "}
    <Link href="/login" className="font-medium text-accent hover:underline">
      Log in
    </Link>
  </>
);

/**
 * Public landing page for a link minted by `workspace/team/actions.ts`'s
 * `inviteTeammateAction` (see `modules/auth/accept-invite.ts` for why this
 * always creates a brand-new account rather than adding a second membership
 * to an existing one). Deliberately public and not gated by `proxy.ts` — see
 * that file's comment on why `/invite/accept` isn't treated like
 * `/login`/`/signup`.
 *
 * Verifying the token here is only for a friendly preview ("Join Acme
 * Records as analyst") — `acceptInviteAction` verifies it again
 * independently before doing anything, so a tampered or expired token can't
 * slip through even if this preview check were bypassed.
 */
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const payload = token ? verifyInviteToken(token, getSessionSecret()) : null;

  if (!token || !payload) {
    return (
      <AuthShell
        title="Invite link invalid or expired"
        subtitle="This invite link isn't valid anymore — ask whoever invited you to send a new one."
        footer={LOG_IN_FOOTER}
      >
        <Link
          href="/"
          className="block w-full rounded-lg border border-line px-4 py-2.5 text-center text-sm font-medium text-tx hover:bg-hover"
        >
          Back to Bekvor
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Join ${payload.workspaceName}`}
      subtitle={`You've been invited as ${payload.role.toLowerCase()}. Set a password for ${payload.email} to get started.`}
      footer={LOG_IN_FOOTER}
    >
      <AcceptInviteForm token={token} />
    </AuthShell>
  );
}
