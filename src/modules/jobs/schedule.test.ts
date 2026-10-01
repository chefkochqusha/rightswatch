import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isScanDue, scanIntervalMs } from "./schedule";

const now = new Date("2026-10-02T04:30:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("isScanDue", () => {
  test("a workspace that was never scanned is due", () => {
    assert.equal(isScanDue({ cadence: "daily", lastScanAt: null, now }), true);
  });

  test("a daily scan from yesterday's run is due, one from this morning is not", () => {
    assert.equal(isScanDue({ cadence: "daily", lastScanAt: hoursAgo(23.9), now }), true);
    assert.equal(isScanDue({ cadence: "daily", lastScanAt: hoursAgo(6), now }), false);
  });

  test("every_6h is due after five hours and not before", () => {
    assert.equal(isScanDue({ cadence: "every_6h", lastScanAt: hoursAgo(5.5), now }), true);
    assert.equal(isScanDue({ cadence: "every_6h", lastScanAt: hoursAgo(3), now }), false);
  });

  test("an unknown or configurable cadence falls back to daily", () => {
    assert.equal(scanIntervalMs("configurable"), scanIntervalMs("daily"));
    assert.equal(scanIntervalMs("whatever"), scanIntervalMs("daily"));
  });
});
