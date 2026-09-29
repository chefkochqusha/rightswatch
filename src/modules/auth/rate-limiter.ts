/**
 * A small in-memory fixed-window rate limiter for login attempts, keyed by
 * an arbitrary string (this module uses the normalized email). Not
 * distributed — like `in-memory-repositories.ts`, this is a stand-in for
 * production infrastructure. A real deployment would move this to
 * Upstash Redis (already chosen for BullMQ — ARCHITECTURE.md "Open
 * decisions") via a sliding-window script; this interface is shaped so a
 * `RedisRateLimiter` is a drop-in replacement with no change to
 * `log-in.ts` or the Server Action that calls it.
 *
 * Deliberately scoped to login only, not signup: signup abuse (disposable
 * emails, scripted account creation) is a different problem best solved
 * with IP-based throttling or CAPTCHA, and this app doesn't yet have a
 * settled convention for trusting a forwarded-IP header from its eventual
 * host — that's future work, not an oversight.
 */
export interface RateLimiter {
  /** Records one failed attempt for `key`. */
  recordFailure(key: string, now?: number): void;
  /** Clears recorded failures for `key` — call on a successful login. */
  reset(key: string): void;
  /** Whether `key` is currently blocked, and for how much longer. */
  isBlocked(key: string, now?: number): { blocked: boolean; retryAfterMs: number };
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BLOCK_MS = 15 * 60 * 1000; // 15 minutes

interface Entry {
  /** Timestamps of failures still inside the current window. */
  failures: number[];
  blockedUntil: number | null;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly entries = new Map<string, Entry>();

  recordFailure(key: string, now: number = Date.now()): void {
    const entry = this.entries.get(key) ?? { failures: [], blockedUntil: null };
    entry.failures = entry.failures.filter((timestamp) => now - timestamp < WINDOW_MS);
    entry.failures.push(now);

    if (entry.failures.length >= MAX_ATTEMPTS) {
      entry.blockedUntil = now + BLOCK_MS;
      entry.failures = [];
    }
    this.entries.set(key, entry);
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  isBlocked(key: string, now: number = Date.now()): { blocked: boolean; retryAfterMs: number } {
    const entry = this.entries.get(key);
    if (!entry?.blockedUntil) return { blocked: false, retryAfterMs: 0 };

    if (now >= entry.blockedUntil) {
      this.entries.delete(key);
      return { blocked: false, retryAfterMs: 0 };
    }
    return { blocked: true, retryAfterMs: entry.blockedUntil - now };
  }
}
