import { verifyPassword } from "./password";
import type { RateLimiter } from "./rate-limiter";
import type { AccountRepository, MembershipRepository, UserRepository } from "./types";

export interface DeleteAccountDependencies {
  userRepository: UserRepository;
  membershipRepository: MembershipRepository;
  accountRepository: AccountRepository;
  /** Keyed by user id: a stolen session can't be used to guess the password. */
  rateLimiter?: RateLimiter;
  /** Runs after every check, before the deletion: the place to write the activity-log line. */
  beforeDelete?: () => Promise<void>;
}

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: "OWNER" | "WRONG_PASSWORD" | "RATE_LIMITED" | "NO_SUCH_USER" };

/**
 * A member deletes their own account (GDPR Art. 17), with their password.
 * An owner can't: the workspace would be left without one. They delete the
 * workspace instead (`deleteWorkspace`). The workspace keeps what the person
 * did there, without their name.
 */
export async function deleteOwnAccount(
  input: { userId: string; password: string },
  deps: DeleteAccountDependencies,
): Promise<DeleteAccountResult> {
  const key = `delete-account:${input.userId}`;
  if (deps.rateLimiter?.isBlocked(key).blocked) return { ok: false, error: "RATE_LIMITED" };

  const user = await deps.userRepository.findById(input.userId);
  if (!user) return { ok: false, error: "NO_SUCH_USER" };

  const memberships = await deps.membershipRepository.findForUser(user.id);
  if (memberships.some((m) => m.role === "OWNER")) return { ok: false, error: "OWNER" };

  if (!(await verifyPassword(input.password, user.passwordHash))) {
    deps.rateLimiter?.recordFailure(key);
    return { ok: false, error: "WRONG_PASSWORD" };
  }

  await deps.beforeDelete?.();
  await deps.accountRepository.deleteUser(user.id);
  return { ok: true };
}
