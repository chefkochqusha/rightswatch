import type { RateLimiter } from "@/modules/auth";
import { InMemoryRateLimiter } from "@/modules/auth";
import { createRateLimiter } from "./rate-limit-store";

/**
 * A request budget for the public and search endpoints: `max` requests per
 * `windowMs` for one key (a user or an address), then a pause for one more
 * window. In memory by default; `shared` budgets count in Postgres where the
 * app runs as several instances.
 */
export interface RequestBudget {
  max: number;
  windowMs: number;
  /**
   * Count across all instances (Postgres on Vercel, `rate-limit-store.ts`).
   * For budgets that guard cost or abuse (uploads, exports, emails); left off
   * for cheap, frequent reads (song search, artwork), where a database write per
   * request would cost more than it saves.
   */
  shared?: boolean;
}

const globalForLimits = globalThis as unknown as { __rightswatchRequestLimiters?: Map<string, RateLimiter> };

function limiterFor(name: string, budget: RequestBudget): RateLimiter {
  const limiters = (globalForLimits.__rightswatchRequestLimiters ??= new Map());
  let limiter = limiters.get(name);
  if (!limiter) {
    const options = { maxAttempts: budget.max, windowMs: budget.windowMs, blockMs: budget.windowMs };
    limiter = budget.shared ? createRateLimiter(`request:${name}`, options) : new InMemoryRateLimiter(options);
    limiters.set(name, limiter);
  }
  return limiter;
}

/**
 * Counts one request against `name` + `key`. Returns the seconds to wait when
 * the budget is spent, or `null` when the request may go ahead.
 */
export async function spendRequest(name: string, key: string, budget: RequestBudget, now: number = Date.now()): Promise<number | null> {
  const limiter = limiterFor(name, budget);
  const state = await limiter.isBlocked(key, now);
  if (state.blocked) return Math.max(1, Math.ceil(state.retryAfterMs / 1000));
  await limiter.recordFailure(key, now);
  return null;
}

/** Vercel sets `x-forwarded-for` itself, so its first entry is the real client address there. */
export function clientIpFrom(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
