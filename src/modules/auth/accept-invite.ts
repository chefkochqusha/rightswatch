import { createUserAccount } from "./create-user-account";
import { verifyInviteToken } from "./invite-token";
import type { MembershipRepository, Role, UserRepository } from "./types";

export interface AcceptInviteInput {
  token: string;
  password: string;
  name: string | null;
}

export interface AcceptInviteDependencies {
  userRepository: UserRepository;
  membershipRepository: MembershipRepository;
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
 * The counterpart to `signUp` for joining an *existing* workspace: creates
 * a new account (via the same `createUserAccount` core signup uses) and a
 * Membership on the workspace/role the token names — never a new
 * workspace. The token is the only source of truth for which workspace
 * and role this is (never trust a form field for that), and it's
 * effectively single-use: re-submitting an already-accepted invite fails
 * with `EMAIL_ALREADY_REGISTERED`, the same natural side effect that makes
 * a second signup attempt fail.
 */
export async function acceptInvite(
  input: AcceptInviteInput,
  deps: AcceptInviteDependencies,
): Promise<AcceptInviteResult> {
  const payload = verifyInviteToken(input.token, deps.secret);
  if (!payload) {
    return { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" };
  }

  const created = await createUserAccount(
    { email: payload.email, password: input.password, name: input.name },
    { userRepository: deps.userRepository },
  );
  if (!created.ok) {
    // INVALID_EMAIL can't happen — the token's email already passed this
    // same check when the invite was issued — but the type still allows
    // it, so fall back to the one error that fits if it somehow did.
    return { ok: false, error: created.error === "WEAK_PASSWORD" ? "WEAK_PASSWORD" : "EMAIL_ALREADY_REGISTERED" };
  }

  await deps.membershipRepository.create({
    userId: created.user.id,
    workspaceId: payload.workspaceId,
    role: payload.role,
  });

  return {
    ok: true,
    user: { id: created.user.id, email: created.user.email, name: created.user.name },
    workspaceId: payload.workspaceId,
    workspaceName: payload.workspaceName,
    role: payload.role,
  };
}
