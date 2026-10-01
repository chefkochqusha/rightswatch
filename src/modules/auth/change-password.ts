import { hashPassword, verifyPassword } from "./password";
import { MIN_PASSWORD_LENGTH } from "./prepare-user-account";
import type { RateLimiter } from "./rate-limiter";
import type { SessionRepository, UserRepository } from "./types";

export interface ChangePasswordDependencies {
  userRepository: UserRepository;
  sessionRepository: SessionRepository;
  /** Keyed by user id: a stolen session can't be used to guess the current password. */
  rateLimiter?: RateLimiter;
}

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: "WRONG_PASSWORD" | "WEAK_PASSWORD" | "SAME_PASSWORD" | "RATE_LIMITED" | "NO_SUCH_USER" };

/**
 * Changes the password of a signed-in user, who must give the current one
 * first. Every session of the user ends afterwards (the caller starts a
 * fresh one for the browser that made the change), so a session someone
 * else holds doesn't survive it.
 */
export async function changePassword(
  input: { userId: string; currentPassword: string; newPassword: string },
  deps: ChangePasswordDependencies,
): Promise<ChangePasswordResult> {
  const key = `change-password:${input.userId}`;
  if (deps.rateLimiter?.isBlocked(key).blocked) return { ok: false, error: "RATE_LIMITED" };

  const user = await deps.userRepository.findById(input.userId);
  if (!user) return { ok: false, error: "NO_SUCH_USER" };

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    deps.rateLimiter?.recordFailure(key);
    return { ok: false, error: "WRONG_PASSWORD" };
  }
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, error: "WEAK_PASSWORD" };
  if (input.newPassword === input.currentPassword) return { ok: false, error: "SAME_PASSWORD" };

  await deps.userRepository.updatePasswordHash(user.id, await hashPassword(input.newPassword));
  await deps.sessionRepository.deleteAllForUser(user.id);
  return { ok: true };
}
