import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { sortCasesByUrgency, statusInGroup } from "./case-list";

describe("case list", () => {
  test("active means open, in review or waiting; closed is the rest", () => {
    for (const status of ["OPEN", "IN_PROGRESS", "WAITING"] as const) {
      assert.equal(statusInGroup(status, "active"), true);
      assert.equal(statusInGroup(status, "closed"), false);
    }
    for (const status of ["CLEARED", "RESOLVED", "DISMISSED"] as const) {
      assert.equal(statusInGroup(status, "active"), false);
      assert.equal(statusInGroup(status, "closed"), true);
    }
    assert.equal(statusInGroup("RESOLVED", "all"), true);
  });

  test("sorts by priority, then the longest untouched first", () => {
    const day = (n: number) => new Date(2026, 8, n);
    const sorted = sortCasesByUrgency([
      { id: "low-old", priority: "LOW" as const, updatedAt: day(1) },
      { id: "high-new", priority: "HIGH" as const, updatedAt: day(9) },
      { id: "critical", priority: "CRITICAL" as const, updatedAt: day(5) },
      { id: "high-old", priority: "HIGH" as const, updatedAt: day(2) },
    ]);
    assert.deepEqual(sorted.map((c) => c.id), ["critical", "high-old", "high-new", "low-old"]);
  });
});
