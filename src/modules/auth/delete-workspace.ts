import { verifyPassword } from "./password";
import type { RateLimiter } from "./rate-limiter";
import type { AccountRepository, MembershipRepository, UserRepository, WorkspaceRepository } from "./types";

export interface DeleteWorkspaceDependencies {
  userRepository: UserRepository;
  workspaceRepository: WorkspaceRepository;
  membershipRepository: MembershipRepository;
  accountRepository: AccountRepository;
  /** Keyed by user id: a stolen session can't be used to guess the password. */
  rateLimiter?: RateLimiter;
  /**
   * Runs once the request has passed every check and before anything is
   * deleted: the place to end the subscription. If it throws, nothing is
   * deleted and the error reaches the caller, so a workspace never loses its
   * data while a payment keeps running.
   */
  beforeDelete?: () => Promise<void>;
}

export type DeleteWorkspaceResult =
  | { ok: true }
  | { ok: false; error: "NOT_OWNER" | "WRONG_PASSWORD" | "NAME_MISMATCH" | "RATE_LIMITED" | "NO_SUCH_WORKSPACE" };

/**
 * Deletes a workspace and everything in it, for good (GDPR Art. 17). Only
 * its owner can, and has to prove it twice: their password, and the
 * workspace's name typed out.
 */
export async function deleteWorkspace(
  input: { workspaceId: string; actorUserId: string; password: string; confirmName: string },
  deps: DeleteWorkspaceDependencies,
): Promise<DeleteWorkspaceResult> {
  const key = `delete-workspace:${input.actorUserId}`;
  if (deps.rateLimiter?.isBlocked(key).blocked) return { ok: false, error: "RATE_LIMITED" };

  const workspace = await deps.workspaceRepository.findById(input.workspaceId);
  if (!workspace) return { ok: false, error: "NO_SUCH_WORKSPACE" };

  const membership = await deps.membershipRepository.findForUserAndWorkspace(input.actorUserId, workspace.id);
  if (!membership || membership.role !== "OWNER") return { ok: false, error: "NOT_OWNER" };

  const user = await deps.userRepository.findById(input.actorUserId);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    deps.rateLimiter?.recordFailure(key);
    return { ok: false, error: "WRONG_PASSWORD" };
  }
  if (input.confirmName.trim() !== workspace.name) return { ok: false, error: "NAME_MISMATCH" };

  await deps.beforeDelete?.();
  await deps.accountRepository.deleteWorkspace(workspace.id);
  return { ok: true };
}
