import { verifyPassword } from "./password";
import type { RateLimiter } from "./rate-limiter";
import type { UserRepository } from "./types";

export interface LogInInput {
  email: string;
  password: string;
}

export interface LogInDependencies {
  userRepository: UserRepository;
  /** Optional so existing callers/tests that don't care about brute-force
   *  protection don't need to construct one; the real app always passes
   *  one (see `app/_lib/auth-store.ts`). */
  rateLimiter?: RateLimiter;
}

export type LogInResult =
  | { ok: true; user: { id: string; email: string; name: string | null } }
  | { ok: false; error: "INVALID_CREDENTIALS" }
  | { ok: false; error: "RATE_LIMITED"; retryAfterMs: number };

/**
 * Phase 5, hardened: brute-force protection via an optional `RateLimiter`
 * keyed by the normalized email (see `rate-limiter.ts` for why email
 * rather than IP, for now). Deliberately returns the same
 * `INVALID_CREDENTIALS` error whether the email doesn't exist or the
 * password is wrong for that email — never reveal which one it was, so a
 * login form can't be used to enumerate registered emails. The rate-limit
 * check happens before that lookup so a blocked attacker can't keep
 * probing for valid emails via timing either.
 */
export async function logIn(
  input: LogInInput,
  deps: LogInDependencies,
): Promise<LogInResult> {
  const email = input.email.trim().toLowerCase();

  const limitStatus = deps.rateLimiter?.isBlocked(email);
  if (limitStatus?.blocked) {
    return { ok: false, error: "RATE_LIMITED", retryAfterMs: limitStatus.retryAfterMs };
  }

  const user = await deps.userRepository.findByEmail(email);
  if (!user) {
    deps.rateLimiter?.recordFailure(email);
    return { ok: false, error: "INVALID_CREDENTIALS" };
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    deps.rateLimiter?.recordFailure(email);
    return { ok: false, error: "INVALID_CREDENTIALS" };
  }

  deps.rateLimiter?.reset(email);
  return { ok: true, user: { id: user.id, email: user.email, name: user.name } };
}
