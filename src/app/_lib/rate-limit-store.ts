import { createHmac, createHash } from "node:crypto";
import { InMemoryRateLimiter, type RateLimiter, type RateLimiterOptions, type RateLimitState } from "@/modules/auth";
import { getPrisma } from "@/lib/prisma-client";
import { log } from "./log";

const DEFAULTS = { maxAttempts: 5, windowMs: 15 * 60_000, blockMs: 15 * 60_000 };
/** Rows untouched for a day and not blocked are removed now and then. */
const STALE_MS = 24 * 60 * 60_000;
const PRUNE_EVERY = 200;

/**
 * A rate limiter whose counts live in Postgres (`rate_limits`), so every
 * serverless instance sees the same ones. Same rules as `InMemoryRateLimiter`
 * but with a fixed window: `maxAttempts` failures inside `windowMs` block the
 * key for `blockMs`.
 *
 * Keys hold emails and IP addresses, so only an HMAC of them is stored. If the
 * database can't be asked, the limiter lets the request through and logs it:
 * the database being down already stops logins, and locking everyone out on
 * top would help nobody.
 */
export class PostgresRateLimiter implements RateLimiter {
  private readonly options: Required<RateLimiterOptions>;
  private calls = 0;

  constructor(
    private readonly scope: string,
    options: RateLimiterOptions = {},
    private readonly secret: string = process.env.SESSION_SECRET ?? "",
  ) {
    this.options = { ...DEFAULTS, ...options } as Required<RateLimiterOptions>;
  }

  private hash(key: string): string {
    return this.secret ? createHmac("sha256", this.secret).update(key).digest("hex") : createHash("sha256").update(key).digest("hex");
  }

  async recordFailure(key: string, now: number = Date.now()): Promise<void> {
    const at = new Date(now);
    const windowFloor = new Date(now - this.options.windowMs);
    const keyHash = this.hash(key);
    try {
      const db = getPrisma();
      const rows = await db.$queryRaw<{ failures: number }[]>`
        INSERT INTO "rate_limits" ("scope", "keyHash", "failures", "windowStart", "blockedUntil", "updatedAt")
        VALUES (${this.scope}, ${keyHash}, 1, ${at}::timestamp, NULL, ${at}::timestamp)
        ON CONFLICT ("scope", "keyHash") DO UPDATE SET
          "failures" = CASE WHEN "rate_limits"."windowStart" <= ${windowFloor}::timestamp THEN 1 ELSE "rate_limits"."failures" + 1 END,
          "windowStart" = CASE WHEN "rate_limits"."windowStart" <= ${windowFloor}::timestamp THEN ${at}::timestamp ELSE "rate_limits"."windowStart" END,
          "updatedAt" = ${at}::timestamp
        RETURNING "failures"`;
      if ((rows[0]?.failures ?? 0) >= this.options.maxAttempts) {
        const until = new Date(now + this.options.blockMs);
        await db.$executeRaw`
          UPDATE "rate_limits" SET "blockedUntil" = ${until}::timestamp, "failures" = 0, "windowStart" = ${at}::timestamp
          WHERE "scope" = ${this.scope} AND "keyHash" = ${keyHash}`;
      }
      if (++this.calls % PRUNE_EVERY === 0) {
        const stale = new Date(now - STALE_MS);
        await db.$executeRaw`
          DELETE FROM "rate_limits"
          WHERE "updatedAt" < ${stale}::timestamp AND ("blockedUntil" IS NULL OR "blockedUntil" < ${at}::timestamp)`;
      }
    } catch (error) {
      log("warn", "rate_limit.unavailable", { scope: this.scope, op: "record", error: (error as Error).message });
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await getPrisma().$executeRaw`DELETE FROM "rate_limits" WHERE "scope" = ${this.scope} AND "keyHash" = ${this.hash(key)}`;
    } catch (error) {
      log("warn", "rate_limit.unavailable", { scope: this.scope, op: "reset", error: (error as Error).message });
    }
  }

  async isBlocked(key: string, now: number = Date.now()): Promise<RateLimitState> {
    try {
      const rows = await getPrisma().$queryRaw<{ blockedUntil: Date | null }[]>`
        SELECT "blockedUntil" FROM "rate_limits" WHERE "scope" = ${this.scope} AND "keyHash" = ${this.hash(key)}`;
      const until = rows[0]?.blockedUntil?.getTime() ?? 0;
      return until > now ? { blocked: true, retryAfterMs: until - now } : { blocked: false, retryAfterMs: 0 };
    } catch (error) {
      log("warn", "rate_limit.unavailable", { scope: this.scope, op: "check", error: (error as Error).message });
      return { blocked: false, retryAfterMs: 0 };
    }
  }
}

/**
 * Where limits are counted: in Postgres when the app runs as several instances
 * (on Vercel, or `RATE_LIMIT_STORE=postgres`), in memory otherwise (our own
 * server runs one app process, so memory is already shared and costs nothing).
 * `RATE_LIMIT_STORE=memory` forces memory anywhere.
 */
export function sharedRateLimitsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const store = env.RATE_LIMIT_STORE?.trim().toLowerCase();
  if (store === "memory") return false;
  return store === "postgres" || env.VERCEL === "1";
}

/** A limiter for `scope` (unique per use), shared across instances where that matters. */
export function createRateLimiter(scope: string, options: RateLimiterOptions = {}): RateLimiter {
  return sharedRateLimitsEnabled() ? new PostgresRateLimiter(scope, options) : new InMemoryRateLimiter(options);
}
