import { EMAIL_PATTERN } from "./prepare-user-account";
import { createInviteToken, INVITABLE_ROLES } from "./invite-token";
import type { Role } from "./types";

export interface InviteTeammateInput {
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: Role;
}

export interface InviteTeammateDependencies {
  /** `SESSION_SECRET` — the invite link is signed with a key derived from it
   *  (`derive-key.ts`), never with the session-cookie key itself. */
  secret: string;
}

export type InviteTeammateResult =
  | { ok: true; token: string }
  | { ok: false; error: "INVALID_EMAIL" | "INVALID_ROLE" };

/**
 * OWNER can't be invited — Phase 5 gives a workspace exactly one OWNER, set
 * at signup, and adding a second is a bigger tenancy decision than this
 * feature makes on its own.
 *
 * Deliberately doesn't check whether the email already has an account. It
 * used to, and said so: since anyone can sign up for free and become an
 * OWNER, the invite form was an unthrottled oracle for which emails are
 * registered (raised by an independent security review). An invite for an
 * existing account is now rejected when it's accepted instead
 * (`acceptInvite`), shown only to whoever holds the link.
 */
export async function inviteTeammate(
  input: InviteTeammateInput,
  deps: InviteTeammateDependencies,
): Promise<InviteTeammateResult> {
  const email = input.email.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "INVALID_EMAIL" };
  }
  if (!INVITABLE_ROLES.includes(input.role)) {
    return { ok: false, error: "INVALID_ROLE" };
  }

  const token = createInviteToken(
    { workspaceId: input.workspaceId, workspaceName: input.workspaceName, email, role: input.role },
    deps.secret,
  );

  return { ok: true, token };
}
