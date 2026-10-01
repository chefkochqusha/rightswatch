import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { describeTerm, describeTerritory, describeUsage, recordState, songRightsSummary } from "./record-summary";
import type { RightsRecordRow } from "@/modules/rights";

const NOW = new Date("2026-10-01T12:00:00Z");

function record(overrides: Partial<RightsRecordRow> = {}): RightsRecordRow {
  return {
    id: "rr",
    workspaceId: "w",
    trackId: "t",
    territories: [],
    commercial: true,
    organic: true,
    startDate: new Date("2026-01-01T00:00:00Z"),
    endDate: null,
    campaignIds: [],
    notes: null,
    source: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("rights record in words", () => {
  test("usage, territory and term", () => {
    assert.equal(describeUsage(record()), "Commercial and organic use");
    assert.equal(describeUsage(record({ commercial: false })), "Organic use only");
    assert.equal(describeTerritory(record()), "Worldwide");
    assert.equal(describeTerritory(record({ territories: ["DE", "AT", "CH"] })), "Germany, Austria, Switzerland");
    assert.equal(describeTerritory(record({ territories: ["DE", "AT", "CH", "FR", "IT"] })), "Germany, Austria, Switzerland and 2 more");
    assert.equal(describeTerm(record()), "From Jan 1, 2026, no end date");
    assert.equal(
      describeTerm(record({ endDate: new Date("2026-09-22T23:59:59.999Z") })),
      "Jan 1, 2026 to Sep 22, 2026",
      "an end date reads as the day it covers, whatever the viewer's time zone",
    );
  });

  test("state, and the catalogue line", () => {
    assert.equal(recordState(record(), NOW), "IN_FORCE");
    assert.equal(recordState(record({ endDate: new Date("2026-09-22T23:59:59Z") }), NOW), "ENDED");
    assert.equal(recordState(record({ startDate: new Date("2027-01-01T00:00:00Z") }), NOW), "NOT_STARTED");

    assert.deepEqual(songRightsSummary([], NOW), { text: "No rights record", missing: true });
    assert.deepEqual(songRightsSummary([record({ endDate: new Date("2026-09-22T23:59:59Z") })], NOW), {
      text: "Every record has ended",
      missing: true,
    });
    assert.deepEqual(songRightsSummary([record({ territories: ["DE"], organic: false, campaignIds: ["c"] })], NOW), {
      text: "Germany, commercial only, one campaign",
      missing: false,
    });
    assert.equal(songRightsSummary([record(), record({ id: "rr2" })], NOW).text, "2 records in force");
  });
});
