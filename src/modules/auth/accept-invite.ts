import { UniqueConstraintError } from "./errors";
import { verifyInviteToken } from "./invite-token";
import { prepareUserAccount } from "./prepare-user-account";
import type { AccountRepository, Role, UserRepository } from "./types";

export interface AcceptInviteInput {
  token: string;
  password: string;
  name: string | null;
}

export interface AcceptInviteDependencies {
  userRepository: UserRepository;
  accountRepository: AccountRepository;
  secret: string;
}

export type AcceptInviteResult =
  | {
      ok: true;
      user: { id: string; email: string; name: string | null };
      workspaceId: string;
      workspaceName: string;
      role: Role;
    }
  | {
      ok: false;
      error: "INVALID_OR_EXPIRED_TOKEN" | "WEAK_PASSWORD" | "EMAIL_ALREADY_REGISTERED";
    };

/**
 * The counterpart to `signUp` for joining an *existing* workspace: creates a
 * new account (through the same `prepareUserAccount` core) together with a
 * Membership on the workspace and role the token names — one atomic write,
 * never a new workspace and never a user without a membership.
 *
 * The token is the only source of truth for workspace and role (never a form
 * field), and `verifyInviteToken` re-checks that the role is invitable
 * rather than trusting it was checked when the link was minted.
 *
 * Effectively single-use: re-submitting an accepted invite fails with
 * `EMAIL_ALREADY_REGISTERED`, because the account now exists. The same error
 * covers an email that already had an account before the invite — the
 * inviter isn't told up front (that would let any signed-up user probe
 * which emails are registered), so this is where it surfaces, to the person
 * holding the link. Joining a second workspace from an existing account
 * isn't supported (`current-user.ts` gives a user exactly one membership).
 */
export async function acceptInvite(
  input: AcceptInviteInput,
  deps: AcceptInviteDependencies,
): Promise<AcceptInviteResult> {
  const payload = verifyInviteToken(input.token, deps.secret);
  if (!payload) {
    return { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" };
  }

  const prepared = await prepareUserAccount(
    { email: payload.email, password: input.password, name: input.name },
    { userRepository: deps.userRepository },
  );
  if (!prepared.ok) {
    // INVALID_EMAIL can't happen — the token's email passed this same check
    // when the invite was issued — but the type allows it, so fall back to
    // the one error that fits if it somehow did.
    return {
      ok: false,
      error: prepared.error === "WEAK_PASSWORD" ? "WEAK_PASSWORD" : "EMAIL_ALREADY_REGISTERED",
    };
  }

  try {
    const { user } = await deps.accountRepository.createAccount({
      user: prepared.account,
      role: payload.role,
      workspace: { existingId: payload.workspaceId },
    });
    return {
      ok: true,
      user: { id: user.id, email: user.email, name: user.name },
      workspaceId: payload.workspaceId,
      workspaceName: payload.workspaceName,
      role: payload.role,
    };
  } catch (error) {
    // Two accepts of the same link racing each other: the other one won.
    if (error instanceof UniqueConstraintError) {
      return { ok: false, error: "EMAIL_ALREADY_REGISTERED" };
    }
    throw error;
  }
}
