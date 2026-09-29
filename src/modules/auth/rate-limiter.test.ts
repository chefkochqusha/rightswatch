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
    // Well past the 15-minute window — the first two failures should have expired.
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
});
