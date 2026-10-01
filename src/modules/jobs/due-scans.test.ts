import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { runDueScansFor } from "./due-scans";

const now = new Date("2026-10-02T04:30:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

function setup(overrides: Partial<Parameters<typeof runDueScansFor>[0]> = {}) {
  const scanned: string[] = [];
  const base = {
    workspaceIds: ["due", "fresh", "no-plan", "never"],
    cadenceFor: async (id: string) => (id === "no-plan" ? null : "daily"),
    lastCompletedAt: async (id: string) => (id === "due" ? hoursAgo(24) : id === "fresh" ? hoursAgo(2) : null),
    scan: async (id: string) => {
      scanned.push(id);
      return true;
    },
    now,
    deadline: Number.MAX_SAFE_INTEGER,
  };
  return { scanned, run: () => runDueScansFor({ ...base, ...overrides }) };
}

describe("runDueScansFor", () => {
  test("scans the workspaces that are due and skips the rest", async () => {
    const { scanned, run } = setup();
    const summary = await run();
    assert.deepEqual(scanned, ["due", "never"]);
    assert.deepEqual(summary, { workspaces: 4, scanned: 2, notDue: 2, failed: 0, deferred: 0 });
  });

  test("one failing workspace doesn't stop the others", async () => {
    const errors: string[] = [];
    const scanned: string[] = [];
    const summary = await runDueScansFor({
      workspaceIds: ["a", "b", "c"],
      cadenceFor: async () => "daily",
      lastCompletedAt: async () => null,
      scan: async (id) => {
        if (id === "b") throw new Error("boom");
        scanned.push(id);
        return true;
      },
      now,
      deadline: Number.MAX_SAFE_INTEGER,
      onError: (id) => errors.push(id),
    });
    assert.deepEqual(scanned, ["a", "c"]);
    assert.deepEqual(errors, ["b"]);
    assert.equal(summary.failed, 1);
    assert.equal(summary.scanned, 2);
  });

  test("a workspace with nothing to scan counts as not due, not as failed", async () => {
    const { run } = setup({ scan: async () => false });
    const summary = await run();
    assert.equal(summary.scanned, 0);
    assert.equal(summary.failed, 0);
  });

  test("stops starting scans once the time budget is spent", async () => {
    let ticks = 0;
    const { scanned, run } = setup({ deadline: 100, clock: () => (ticks++ === 0 ? 50 : 500) });
    const summary = await run();
    assert.deepEqual(scanned, ["due"]);
    assert.equal(summary.deferred, 1);
  });
});
