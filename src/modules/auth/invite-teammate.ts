import { EMAIL_PATTERN } from "./create-user-account";
import { createInviteToken } from "./invite-token";
import type { Role, UserRepository } from "./types";

const INVITABLE_ROLES: Role[] = ["ADMIN", "ANALYST", "VIEWER"];

export interface InviteTeammateInput {
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: Role;
}

export interface InviteTeammateDependencies {
  userRepository: UserRepository;
  /** `SESSION_SECRET` — the invite token is signed with the same secret
   *  session cookies are, since both are HMAC payloads this server alone
   *  must be able to produce and verify. */
  secret: string;
}

export type InviteTeammateResult =
  | { ok: true; token: string }
  | { ok: false; error: "INVALID_EMAIL" | "INVALID_ROLE" | "EMAIL_HAS_EXISTING_ACCOUNT" };

/**
 * OWNER can't be invited — Phase 5 gives a workspace exactly one OWNER, set
 * at signup, and adding a second is a bigger tenancy decision than this
 * feature makes on its own.
 *
 * Rejects an email that already has a RightsWatch account rather than
 * letting the invite fail later at acceptance: `current-user.ts` gives a
 * user exactly one membership today ("first membership" is unambiguous"),
 * so accepting a second workspace's invite would silently break that
 * assumption. Multi-workspace membership is future work (see that file's
 * comment) — this only ever creates a *brand-new* account that joins
 * straight into the invited workspace, never a second membership on an
 * existing one.
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

  const existing = await deps.userRepository.findByEmail(email);
  if (existing) {
    return { ok: false, error: "EMAIL_HAS_EXISTING_ACCOUNT" };
  }

  const token = createInviteToken(
    { workspaceId: input.workspaceId, workspaceName: input.workspaceName, email, role: input.role },
    deps.secret,
  );

  return { ok: true, token };
}
