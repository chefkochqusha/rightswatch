/**
 * Checks the shared rate limiter (`rate_limits`) against a LOCAL database:
 * two limiters with the same scope stand for two serverless instances; their
 * failures must add up, a block must be seen by both, keys must never be
 * stored in plain text, and a window must end. Run:
 *   set -a && . ./.env.local && set +a && npx tsx scripts/local-db/rate-limit-check.mts
 */
import assert from "node:assert/strict";
import { PostgresRateLimiter } from "../../src/app/_lib/rate-limit-store";
import { getPrisma } from "../../src/lib/prisma-client";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) throw new Error("Local database only.");

const scope = `rate-limit-check-${Date.now()}`;
const options = { maxAttempts: 3, windowMs: 60_000, blockMs: 120_000 };
// Two limiters, one scope: two serverless instances.
const a = new PostgresRateLimiter(scope, options, "check-secret");
const b = new PostgresRateLimiter(scope, options, "check-secret");
const db = getPrisma();
try {
  const t0 = Date.now();
  const key = "someone@example.com|203.0.113.7";

  // Failures from two instances add up to one block, seen by both.
  await a.recordFailure(key, t0);
  await b.recordFailure(key, t0 + 1);
  assert.equal((await a.isBlocked(key, t0 + 2)).blocked, false);
  await a.recordFailure(key, t0 + 3);
  const state = await b.isBlocked(key, t0 + 4);
  assert.equal(state.blocked, true, "blocked across instances");
  assert.ok(state.retryAfterMs > 100_000 && state.retryAfterMs <= 120_000);
  assert.equal((await a.isBlocked(key, t0 + 120_004)).blocked, false, "the block ends");

  // Another key is untouched; a reset clears.
  assert.equal((await a.isBlocked("other", t0)).blocked, false);
  await a.reset(key);
  assert.equal((await b.isBlocked(key, t0 + 5)).blocked, false, "reset clears for all");

  // Failures spread wider than the window don't add up.
  await a.recordFailure("slow", t0);
  await a.recordFailure("slow", t0 + 30_000);
  await a.recordFailure("slow", t0 + 61_000);
  assert.equal((await a.isBlocked("slow", t0 + 61_001)).blocked, false, "the window ends");

  // Only hashes are stored.
  const rows = await db.$queryRaw<{ keyHash: string }[]>`SELECT "keyHash" FROM "rate_limits" WHERE "scope" = ${scope}`;
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((r) => /^[0-9a-f]{64}$/.test(r.keyHash) && !r.keyHash.includes("example")), "keys are hashed");

  // Concurrency: 10 failures at once from both instances all count.
  await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? a : b).recordFailure("burst", t0 + i)));
  assert.equal((await a.isBlocked("burst", t0 + 20)).blocked, true, "a burst blocks");

  console.log("rate-limit-check: ok");
} finally {
  await db.$executeRaw`DELETE FROM "rate_limits" WHERE "scope" = ${scope}`;
  await db.$disconnect();
}
