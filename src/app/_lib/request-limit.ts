import { InMemoryRateLimiter } from "@/modules/auth";

/**
 * A request budget for the public and search endpoints: `max` requests per
 * `windowMs` for one key (a user or an address), then a pause for one more
 * window. In memory, per serverless instance — like the login limits, it slows
 * a script down rather than stopping a determined one (the shared limit waits
 * on Upstash Redis, see RELEASE_CHECKLIST.md).
 */
export interface RequestBudget {
  max: number;
  windowMs: number;
}

const globalForLimits = globalThis as unknown as { __rightswatchRequestLimiters?: Map<string, InMemoryRateLimiter> };

function limiterFor(name: string, budget: RequestBudget): InMemoryRateLimiter {
  const limiters = (globalForLimits.__rightswatchRequestLimiters ??= new Map());
  let limiter = limiters.get(name);
  if (!limiter) {
    limiter = new InMemoryRateLimiter({ maxAttempts: budget.max, windowMs: budget.windowMs, blockMs: budget.windowMs });
    limiters.set(name, limiter);
  }
  return limiter;
}

/**
 * Counts one request against `name` + `key`. Returns the seconds to wait when
 * the budget is spent, or `null` when the request may go ahead.
 */
export function spendRequest(name: string, key: string, budget: RequestBudget, now: number = Date.now()): number | null {
  const limiter = limiterFor(name, budget);
  const state = limiter.isBlocked(key, now);
  if (state.blocked) return Math.max(1, Math.ceil(state.retryAfterMs / 1000));
  limiter.recordFailure(key, now);
  return null;
}

/** Vercel sets `x-forwarded-for` itself, so its first entry is the real client address there. */
export function clientIpFrom(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
