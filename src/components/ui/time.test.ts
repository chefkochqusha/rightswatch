import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRelativeTime } from "./time";

const now = new Date("2026-10-01T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

test("formatRelativeTime reads recent times the way people say them", () => {
  assert.equal(formatRelativeTime(ago(20_000), now), "just now");
  assert.equal(formatRelativeTime(ago(5 * 60_000), now), "5 minutes ago");
  assert.equal(formatRelativeTime(ago(3 * 3_600_000), now), "3 hours ago");
  assert.equal(formatRelativeTime(ago(26 * 3_600_000), now), "yesterday");
  assert.equal(formatRelativeTime(ago(15 * 86_400_000), now), "2 weeks ago");
  assert.equal(formatRelativeTime(ago(400 * 86_400_000), now), "Aug 27, 2025");
});
