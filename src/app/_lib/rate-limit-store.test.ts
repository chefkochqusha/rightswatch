import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sharedRateLimitsEnabled } from "./rate-limit-store";

describe("sharedRateLimitsEnabled", () => {
  it("counts in Postgres on Vercel, where the app runs as many instances", () => {
    assert.equal(sharedRateLimitsEnabled({ VERCEL: "1" }), true);
    assert.equal(sharedRateLimitsEnabled({}), false, "our own server: one process, memory is shared already");
  });
  it("can be forced either way", () => {
    assert.equal(sharedRateLimitsEnabled({ RATE_LIMIT_STORE: "postgres" }), true);
    assert.equal(sharedRateLimitsEnabled({ VERCEL: "1", RATE_LIMIT_STORE: "memory" }), false);
    assert.equal(sharedRateLimitsEnabled({ RATE_LIMIT_STORE: " Postgres " }), true);
  });
});
