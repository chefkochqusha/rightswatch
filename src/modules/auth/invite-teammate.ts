import { EMAIL_PATTERN } from "./prepare-user-account";
import { createInviteToken, INVITABLE_ROLES, INVITE_TOKEN_TTL_MS } from "./invite-token";
import type { InviteRepository, Role } from "./types";

export interface InviteTeammateInput {
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: Role;
  /** Who sent it, for the pending list. */
  invitedById: string | null;
}

export interface InviteTeammateDependencies {
  /** `SESSION_SECRET` — the invite link is signed with a key derived from it
   *  (`derive-key.ts`), never with the session-cookie key itself. */
  secret: string;
  inviteRepository: InviteRepository;
  now?: Date;
}

export type InviteTeammateResult =
  | { ok: true; token: string; inviteId: string }
  | { ok: false; error: "INVALID_EMAIL" | "INVALID_ROLE" };

/** Accepted, revoked or expired invites are deleted this long afterwards. */
export const SETTLED_INVITE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * OWNER can't be invited — Phase 5 gives a workspace exactly one OWNER, set
 * at signup, and adding a second is a bigger tenancy decision than this
 * feature makes on its own.
 *
 * Inviting the same email again revokes their earlier pending invites, so
 * only the newest link works (a resent invite with a different role can't be
 * undercut by the old link).
 *
 * Deliberately doesn't check whether the email already has an account. It
 * used to, and said so: since anyone can sign up for free and become an
 * OWNER, the invite form was an unthrottled oracle for which emails are
 * registered (raised by an independent security review). An invite for an
 * existing account is now rejected when it's accepted instead
 * (`acceptInvite`), shown only to whoever holds the link.
 *
 * Old invite rows are removed here too, rather than by a scheduled job, so
 * the same code keeps the table small on Vercel and on our own server.
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

  const now = deps.now ?? new Date();
  await deps.inviteRepository.deleteSettled(new Date(now.getTime() - SETTLED_INVITE_RETENTION_MS));
  await deps.inviteRepository.revoke(input.workspaceId, { email }, now);
  const invite = await deps.inviteRepository.create({
    workspaceId: input.workspaceId,
    email,
    role: input.role,
    invitedById: input.invitedById,
    expiresAt: new Date(now.getTime() + INVITE_TOKEN_TTL_MS),
  });

  const token = createInviteToken(
    { inviteId: invite.id, workspaceId: input.workspaceId, workspaceName: input.workspaceName, email, role: input.role },
    deps.secret,
    now.getTime(),
  );

  return { ok: true, token, inviteId: invite.id };
}

/**
 * Takes back a pending invite. Scoped to the workspace, so an id from another
 * workspace changes nothing. Returns false when there was nothing pending
 * (already used, already revoked, or not this workspace's).
 */
export async function revokeInvite(
  input: { workspaceId: string; inviteId: string },
  deps: { inviteRepository: InviteRepository; now?: Date },
): Promise<boolean> {
  return (await deps.inviteRepository.revoke(input.workspaceId, { id: input.inviteId }, deps.now ?? new Date())) > 0;
}
