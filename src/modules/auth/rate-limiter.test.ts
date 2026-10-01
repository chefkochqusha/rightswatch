import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { InMemoryRateLimiter } from "./rate-limiter";

describe("InMemoryRateLimiter", () => {
  test("is not blocked before any failures", () => {
    const limiter = new InMemoryRateLimiter();
    assert.deepEqual(limiter.isBlocked("jane@acme.com", 0), { blocked: false, retryAfterMs: 0 });
  });

  test("is not blocked after fewer than 5 failures", () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < 4; i++) limiter.recordFailure("jane@acme.com", 0);
    assert.equal(limiter.isBlocked("jane@acme.com", 0).blocked, false);
  });

  test("blocks after the 5th failure within the window", () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < 5; i++) limiter.recordFailure("jane@acme.com", 0);
    const status = limiter.isBlocked("jane@acme.com", 0);
    assert.equal(status.blocked, true);
    assert.equal(status.retryAfterMs, 15 * 60 * 1000);
  });

  test("unblocks once the block window has fully elapsed", () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < 5; i++) limiter.recordFailure("jane@acme.com", 0);
    const fifteenMinutesLater = 15 * 60 * 1000;
    assert.equal(limiter.isBlocked("jane@acme.com", fifteenMinutesLater - 1).blocked, true);
    assert.equal(limiter.isBlocked("jane@acme.com", fifteenMinutesLater).blocked, false);
  });

  test("failures outside the 15-minute window don't count toward the limit", () => {
    const limiter = new InMemoryRateLimiter();
    limiter.recordFailure("jane@acme.com", 0);
    limiter.recordFailure("jane@acme.com", 1000);
    const muchLater = 20 * 60 * 1000;
    limiter.recordFailure("jane@acme.com", muchLater);
    limiter.recordFailure("jane@acme.com", muchLater + 1);
    limiter.recordFailure("jane@acme.com", muchLater + 2);
    assert.equal(limiter.isBlocked("jane@acme.com", muchLater + 2).blocked, false, "only 3 failures in the current window");
  });

  test("reset clears failures immediately, as on a successful login", () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < 4; i++) limiter.recordFailure("jane@acme.com", 0);
    limiter.reset("jane@acme.com");
    for (let i = 0; i < 4; i++) limiter.recordFailure("jane@acme.com", 1000);
    assert.equal(limiter.isBlocked("jane@acme.com", 1000).blocked, false, "counter restarted after reset");
  });

  test("tracks each key independently", () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < 5; i++) limiter.recordFailure("jane@acme.com", 0);
    assert.equal(limiter.isBlocked("jane@acme.com", 0).blocked, true);
    assert.equal(limiter.isBlocked("someone-else@acme.com", 0).blocked, false);
  });

  test("thresholds and durations are configurable", () => {
    const limiter = new InMemoryRateLimiter({ maxAttempts: 2, windowMs: 1000, blockMs: 500 });
    limiter.recordFailure("k", 0);
    assert.equal(limiter.isBlocked("k", 0).blocked, false);
    limiter.recordFailure("k", 10);
    assert.deepEqual(limiter.isBlocked("k", 10), { blocked: true, retryAfterMs: 500 });
    assert.equal(limiter.isBlocked("k", 510).blocked, false);
  });

  test("stale keys are swept out instead of piling up forever", () => {
    const limiter = new InMemoryRateLimiter();
    for (let i = 0; i < 1000; i++) limiter.recordFailure(`old-${i}`, 0);
    for (let i = 0; i < 5; i++) limiter.recordFailure("blocked", 0);
    assert.equal(limiter.size, 1001);

    const muchLater = 20 * 60 * 1000;
    limiter.recordFailure("fresh", muchLater);
    assert.equal(limiter.size, 1, "only the key with a recent failure survives");
  });

  test("the sweep never drops a key that is still blocked", () => {
    const limiter = new InMemoryRateLimiter({ blockMs: 60 * 60 * 1000 });
    for (let i = 0; i < 5; i++) limiter.recordFailure("blocked", 0);
    for (let i = 0; i < 1000; i++) limiter.recordFailure(`old-${i}`, 0);

    const later = 20 * 60 * 1000; // past the 15-minute window, inside the hour-long block
    limiter.recordFailure("fresh", later);
    assert.equal(limiter.isBlocked("blocked", later).blocked, true);
  });
});
