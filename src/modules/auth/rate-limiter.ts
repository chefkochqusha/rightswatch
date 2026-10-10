/**
 * A small in-memory fixed-window rate limiter for login attempts, keyed by
 * an arbitrary string — `log-in.ts` keeps two: one per email+IP pair and one
 * per IP across all emails.
 *
 * Not distributed: on Vercel each serverless instance keeps its own counts.
 * There the app uses the Postgres-backed limiter with the same interface
 * (`app/_lib/rate-limit-store.ts`); callers always `await` its answers, so
 * either one fits.
 */
export interface RateLimiter {
  /** Records one failed attempt for `key`. */
  recordFailure(key: string, now?: number): void | Promise<void>;
  /** Clears recorded failures for `key` — call on a successful login. */
  reset(key: string): void | Promise<void>;
  /** Whether `key` is currently blocked, and for how much longer. */
  isBlocked(key: string, now?: number): RateLimitState | Promise<RateLimitState>;
}

export interface RateLimitState {
  blocked: boolean;
  retryAfterMs: number;
}

export interface RateLimiterOptions {
  /** Failures within `windowMs` that trigger a block. Default 5. */
  maxAttempts?: number;
  /** Default 15 minutes. */
  windowMs?: number;
  /** Default 15 minutes. */
  blockMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_BLOCK_MS = 15 * 60 * 1000;
/** Above this many tracked keys, each new failure first sweeps out entries
 *  that no longer hold a recent failure or an active block — so a stream of
 *  failures under fresh keys can't grow the map without bound. */
const PRUNE_THRESHOLD = 1000;

interface Entry {
  /** Timestamps of failures still inside the current window. */
  failures: number[];
  blockedUntil: number | null;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly blockMs: number;

  constructor(options: RateLimiterOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.blockMs = options.blockMs ?? DEFAULT_BLOCK_MS;
  }

  recordFailure(key: string, now: number = Date.now()): void {
    if (this.entries.size >= PRUNE_THRESHOLD) this.prune(now);

    const entry = this.entries.get(key) ?? { failures: [], blockedUntil: null };
    entry.failures = entry.failures.filter((timestamp) => now - timestamp < this.windowMs);
    entry.failures.push(now);

    if (entry.failures.length >= this.maxAttempts) {
      entry.blockedUntil = now + this.blockMs;
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

  /** How many keys are tracked — for tests of pruning, not for callers. */
  get size(): number {
    return this.entries.size;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      const blockActive = entry.blockedUntil !== null && now < entry.blockedUntil;
      const recentFailure = entry.failures.some((timestamp) => now - timestamp < this.windowMs);
      if (!blockActive && !recentFailure) this.entries.delete(key);
    }
  }
}
