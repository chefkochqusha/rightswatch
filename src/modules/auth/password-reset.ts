import { hashPassword } from "./password";
import { createPasswordResetToken, passwordFingerprint, verifyPasswordResetToken } from "./password-reset-token";
import { MIN_PASSWORD_LENGTH } from "./prepare-user-account";
import type { RateLimiter } from "./rate-limiter";
import type { SessionRepository, UserRepository } from "./types";

export interface RequestPasswordResetInput {
  email: string;
}

export interface RequestPasswordResetDependencies {
  userRepository: UserRepository;
  /** Keyed by email, so one inbox can't be flooded. */
  rateLimiter?: RateLimiter;
  secret: string;
  /** Called with the address and the full link, only for an email that has an account. */
  sendResetLink: (to: string, link: string) => Promise<void>;
  /** Builds the page URL a token belongs to. */
  linkFor: (token: string) => string;
  now?: number;
}

/**
 * Asks for a reset link. The answer is the same whether or not the email
 * has an account (Brief §17's enumeration rule, as in `logIn`): the caller
 * says "if there's an account, we've sent a link", never which.
 *
 * Requests count against the limiter whether or not an account exists, so
 * the limiter itself isn't an oracle either.
 */
export async function requestPasswordReset(
  input: RequestPasswordResetInput,
  deps: RequestPasswordResetDependencies,
): Promise<{ ok: true }> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: true };

  if ((await deps.rateLimiter?.isBlocked(email))?.blocked) return { ok: true };
  await deps.rateLimiter?.recordFailure(email);

  const user = await deps.userRepository.findByEmail(email);
  if (!user) return { ok: true };

  const token = createPasswordResetToken(user, deps.secret, deps.now);
  await deps.sendResetLink(user.email, deps.linkFor(token));
  return { ok: true };
}

export interface ResetPasswordDependencies {
  userRepository: UserRepository;
  sessionRepository: SessionRepository;
  secret: string;
  now?: number;
}

export type ResetPasswordResult =
  | { ok: true; userId: string }
  | { ok: false; error: "INVALID_TOKEN" | "WEAK_PASSWORD" };

/**
 * Sets a new password from a reset link and ends every session the user
 * has, so anyone holding the old password or a stolen session is out.
 */
export async function resetPassword(
  input: { token: string; newPassword: string },
  deps: ResetPasswordDependencies,
): Promise<ResetPasswordResult> {
  const payload = verifyPasswordResetToken(input.token, deps.secret, deps.now);
  if (!payload) return { ok: false, error: "INVALID_TOKEN" };

  const user = await deps.userRepository.findById(payload.userId);
  if (!user || passwordFingerprint(user.passwordHash) !== payload.fingerprint) {
    return { ok: false, error: "INVALID_TOKEN" };
  }
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, error: "WEAK_PASSWORD" };

  await deps.userRepository.updatePasswordHash(user.id, await hashPassword(input.newPassword));
  await deps.sessionRepository.deleteAllForUser(user.id);
  return { ok: true, userId: user.id };
}
