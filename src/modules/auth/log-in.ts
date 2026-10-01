import { hashPassword, needsRehash, simulatePasswordCheck, verifyPassword } from "./password";
import type { RateLimiter } from "./rate-limiter";
import type { UserRepository } from "./types";

export interface LogInInput {
  email: string;
  password: string;
  /** The client's address, when the host provides a trustworthy one (on
   *  Vercel, `x-forwarded-for` — see `app/login/actions.ts`). */
  clientIp?: string | null;
}

export interface LogInDependencies {
  userRepository: UserRepository;
  /** Keyed per email + client IP. Optional so callers/tests that don't care
   *  about brute-force protection needn't construct one; the real app always
   *  passes both limiters (see `app/_lib/auth-store.ts`). */
  rateLimiter?: RateLimiter;
  /** Keyed per client IP across all emails, with a higher threshold. */
  ipRateLimiter?: RateLimiter;
}

export type LogInResult =
  | { ok: true; user: { id: string; email: string; name: string | null } }
  | { ok: false; error: "INVALID_CREDENTIALS" }
  | { ok: false; error: "RATE_LIMITED"; retryAfterMs: number };

/**
 * Email/password login (Brief §17), hardened against three things:
 *
 * - **Enumeration.** The same `INVALID_CREDENTIALS` whether the email doesn't
 *   exist or the password is wrong — and the same amount of scrypt work too
 *   (`simulatePasswordCheck`), since an unknown email used to answer before
 *   any hashing happened, which timed out as a reliable oracle.
 * - **Brute force.** Failures count per email+IP and per IP. The rate-limit
 *   check comes before the lookup, so a blocked client learns nothing more.
 * - **Lockout as a weapon.** Keying on the email alone let anyone lock any
 *   account out by failing five times; per email+IP, an attacker's failures
 *   only block the attacker's own address. A successful login resets only
 *   its own email+IP count — never the per-IP one, or logging into your own
 *   account would reset the counter between password-spraying rounds.
 *
 * On success, a password hashed at an older cost is re-hashed at the current
 * one (`password.ts`) — the only moment the plaintext is available to do it.
 */
export async function logIn(
  input: LogInInput,
  deps: LogInDependencies,
): Promise<LogInResult> {
  const email = input.email.trim().toLowerCase();
  const clientIp = input.clientIp?.trim() || null;
  const accountKey = `${email}|${clientIp ?? "unknown"}`;

  const statuses = [
    deps.rateLimiter?.isBlocked(accountKey),
    clientIp ? deps.ipRateLimiter?.isBlocked(clientIp) : undefined,
  ];
  const retryAfterMs = Math.max(0, ...statuses.map((s) => (s?.blocked ? s.retryAfterMs : 0)));
  if (retryAfterMs > 0) {
    return { ok: false, error: "RATE_LIMITED", retryAfterMs };
  }

  const user = await deps.userRepository.findByEmail(email);
  const valid = user
    ? await verifyPassword(input.password, user.passwordHash)
    : await simulatePasswordCheck(input.password);

  if (!user || !valid) {
    deps.rateLimiter?.recordFailure(accountKey);
    if (clientIp) deps.ipRateLimiter?.recordFailure(clientIp);
    return { ok: false, error: "INVALID_CREDENTIALS" };
  }

  deps.rateLimiter?.reset(accountKey);

  if (needsRehash(user.passwordHash)) {
    try {
      await deps.userRepository.updatePasswordHash(user.id, await hashPassword(input.password));
    } catch (error) {
      // Opportunistic: the old hash still works, so a failed upgrade must
      // never turn a correct login into an error. It's retried next login.
      console.error(JSON.stringify({ source: "password_rehash", userId: user.id, error: String(error) }));
    }
  }

  return { ok: true, user: { id: user.id, email: user.email, name: user.name } };
}
