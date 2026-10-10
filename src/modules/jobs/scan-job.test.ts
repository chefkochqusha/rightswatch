import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { InMemoryJobRepository } from "./in-memory-repository";
import { SCAN_JOB_TYPE, creatorScanHistory, emptyScanPayload, type ScanJobPayload } from "./scan-job";

describe("InMemoryJobRepository", () => {
  test("creates, updates and lists a workspace's jobs newest first", async () => {
    const jobs = new InMemoryJobRepository();
    const payload = emptyScanPayload({ triggeredByUserId: "u1", connectorMode: "DEMO", creatorsTotal: 2, skippedOverLimit: 0 });
    const first = await jobs.create<ScanJobPayload>({
      workspaceId: "w1",
      type: SCAN_JOB_TYPE,
      status: "RUNNING",
      attempts: 1,
      startedAt: new Date("2026-10-01T10:00:00Z"),
      payload,
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await jobs.create<ScanJobPayload>({
      workspaceId: "w1",
      type: SCAN_JOB_TYPE,
      status: "QUEUED",
      attempts: 0,
      startedAt: null,
      payload,
    });
    await jobs.create({ workspaceId: "w2", type: SCAN_JOB_TYPE, status: "QUEUED", attempts: 0, startedAt: null, payload });

    const done = await jobs.update<ScanJobPayload>(first.id, { status: "COMPLETED", completedAt: new Date() });
    assert.equal(done.status, "COMPLETED");
    assert.deepEqual(done.payload, payload, "an update without a payload keeps it");

    const recent = await jobs.findRecent<ScanJobPayload>("w1", SCAN_JOB_TYPE, 10);
    assert.deepEqual(recent.map((job) => job.id), [second.id, first.id]);
    assert.equal(await jobs.findById("w2", first.id), null, "scoped by workspace");
  });
});

describe("creatorScanHistory", () => {
  test("lists the creator's line in each scan, or null where the scan didn't reach it", () => {
    const at = new Date("2026-10-01T10:00:00Z");
    const base = emptyScanPayload({ triggeredByUserId: null, connectorMode: "DEMO", creatorsTotal: 1, skippedOverLimit: 0 });
    const lena = { creatorId: "c-lena", handle: "lena.creates", videos: 3, matches: 1, error: null };
    const history = creatorScanHistory(
      [
        { id: "j2", workspaceId: "w1", type: SCAN_JOB_TYPE, status: "FAILED", attempts: 1, startedAt: null, completedAt: null, error: "boom", payload: base, createdAt: at, runAfter: at, maxAttempts: 3 },
        { id: "j1", workspaceId: "w1", type: SCAN_JOB_TYPE, status: "COMPLETED", attempts: 1, startedAt: at, completedAt: at, error: null, payload: { ...base, creators: [lena] }, createdAt: at, runAfter: at, maxAttempts: 3 },
      ],
      "c-lena",
    );
    assert.deepEqual(history, [
      { jobId: "j2", at, status: "FAILED", result: null },
      { jobId: "j1", at, status: "COMPLETED", result: lena },
    ]);
  });
});
