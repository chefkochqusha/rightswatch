import { verifyPassword } from "./password";
import type { RateLimiter } from "./rate-limiter";
import type { AccountRepository, MembershipRepository, Role, SessionRepository, UserRepository } from "./types";

/**
 * Managing the team after people have joined (Brief §16): changing a role,
 * removing someone who left, and handing the workspace to another person.
 *
 * Rules, checked here and not only in the page:
 * - Owners and admins manage the team; analysts and viewers can't.
 * - Nobody changes or removes themselves here (leaving is "Delete my account"
 *   in Settings, with the password), and nobody but the owner touches the owner.
 * - "Owner" is never handed out by a role change: there is exactly one, and
 *   only the owner gives it away (`transferOwnership`), to an admin, with
 *   their password. The old owner stays as an admin.
 * - Removing a person ends their sessions at once. Their account is erased
 *   when this was their only workspace (accepting an invite always creates a
 *   new account, so that's the usual case); what they did stays with the
 *   workspace without their name, as with "Delete my account".
 */

export type ManageableRole = Exclude<Role, "OWNER">;
export const MANAGEABLE_ROLES: readonly ManageableRole[] = ["ADMIN", "ANALYST", "VIEWER"];

export interface ManageMembersDependencies {
  membershipRepository: MembershipRepository;
  accountRepository: AccountRepository;
  sessionRepository: SessionRepository;
}

export type ManageMemberError = "FORBIDDEN" | "NOT_A_MEMBER" | "SELF" | "OWNER" | "INVALID_ROLE";
export type ManageMemberResult = { ok: true; previousRole: Role } | { ok: false; error: ManageMemberError };

async function checkTarget(
  input: { actorId: string; workspaceId: string; targetUserId: string },
  deps: Pick<ManageMembersDependencies, "membershipRepository">,
): Promise<{ ok: true; targetRole: Role } | { ok: false; error: ManageMemberError }> {
  const actor = await deps.membershipRepository.findForUserAndWorkspace(input.actorId, input.workspaceId);
  if (!actor || (actor.role !== "OWNER" && actor.role !== "ADMIN")) return { ok: false, error: "FORBIDDEN" };
  if (input.targetUserId === input.actorId) return { ok: false, error: "SELF" };
  const target = await deps.membershipRepository.findForUserAndWorkspace(input.targetUserId, input.workspaceId);
  if (!target) return { ok: false, error: "NOT_A_MEMBER" };
  if (target.role === "OWNER") return { ok: false, error: "OWNER" };
  return { ok: true, targetRole: target.role };
}

export async function changeMemberRole(
  input: { actorId: string; workspaceId: string; targetUserId: string; role: string },
  deps: Pick<ManageMembersDependencies, "membershipRepository">,
): Promise<ManageMemberResult> {
  if (!MANAGEABLE_ROLES.includes(input.role as ManageableRole)) return { ok: false, error: "INVALID_ROLE" };
  const check = await checkTarget(input, deps);
  if (!check.ok) return check;
  if (check.targetRole !== input.role) {
    await deps.membershipRepository.updateRole(input.targetUserId, input.workspaceId, input.role as ManageableRole);
  }
  return { ok: true, previousRole: check.targetRole };
}

export async function removeMember(
  input: { actorId: string; workspaceId: string; targetUserId: string },
  deps: ManageMembersDependencies,
): Promise<ManageMemberResult> {
  const check = await checkTarget(input, deps);
  if (!check.ok) return check;
  const others = (await deps.membershipRepository.findForUser(input.targetUserId)).filter((m) => m.workspaceId !== input.workspaceId);
  if (others.length === 0) {
    // Sessions and the membership go with the account.
    await deps.accountRepository.deleteUser(input.targetUserId);
  } else {
    await deps.membershipRepository.remove(input.targetUserId, input.workspaceId);
    await deps.sessionRepository.deleteAllForUser(input.targetUserId);
  }
  return { ok: true, previousRole: check.targetRole };
}

export type TransferOwnershipResult =
  | { ok: true }
  | { ok: false; error: "FORBIDDEN" | "NOT_A_MEMBER" | "SELF" | "NOT_AN_ADMIN" | "WRONG_PASSWORD" | "RATE_LIMITED" };

export async function transferOwnership(
  input: { ownerId: string; workspaceId: string; targetUserId: string; password: string },
  deps: { membershipRepository: MembershipRepository; userRepository: UserRepository; rateLimiter?: RateLimiter },
): Promise<TransferOwnershipResult> {
  const key = `transfer-ownership:${input.ownerId}`;
  if ((await deps.rateLimiter?.isBlocked(key))?.blocked) return { ok: false, error: "RATE_LIMITED" };

  const owner = await deps.membershipRepository.findForUserAndWorkspace(input.ownerId, input.workspaceId);
  if (owner?.role !== "OWNER") return { ok: false, error: "FORBIDDEN" };
  if (input.targetUserId === input.ownerId) return { ok: false, error: "SELF" };
  const target = await deps.membershipRepository.findForUserAndWorkspace(input.targetUserId, input.workspaceId);
  if (!target) return { ok: false, error: "NOT_A_MEMBER" };
  if (target.role !== "ADMIN") return { ok: false, error: "NOT_AN_ADMIN" };

  const user = await deps.userRepository.findById(input.ownerId);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    await deps.rateLimiter?.recordFailure(key);
    return { ok: false, error: "WRONG_PASSWORD" };
  }

  await deps.membershipRepository.transferOwnership(input.workspaceId, input.ownerId, input.targetUserId);
  return { ok: true };
}
