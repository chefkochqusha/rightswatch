import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryJobRepository } from "./in-memory-repository";
import { PermanentJobError, processNextJob, retryDelayMs } from "./worker";

/** Minutes from a point an hour ahead, so every job enqueued "now" is due by then. */
const BASE = Date.now() + 3600_000;
const at = (minutes: number) => new Date(BASE + minutes * 60_000);

describe("job queue (in memory)", () => {
  it("hands out due jobs oldest first, once each, and only of the asked types", async () => {
    const queue = new InMemoryJobRepository();
    const first = await queue.enqueue({ workspaceId: "w1", type: "scan", payload: { n: 1 } });
    const second = await queue.enqueue({ workspaceId: "w1", type: "scan", payload: { n: 2 } });
    await queue.enqueue({ workspaceId: "w1", type: "other", payload: null });
    await queue.enqueue({ workspaceId: "w1", type: "scan", payload: null, runAfter: new Date(Date.now() + 60_000) });

    const now = new Date();
    const a = await queue.claim("worker-a", ["scan"], now);
    const b = await queue.claim("worker-b", ["scan"], now);
    const c = await queue.claim("worker-c", ["scan"], now);
    assert.equal(a?.id, first.id);
    assert.equal(b?.id, second.id);
    assert.equal(c, null, "the later job isn't due and 'other' wasn't asked for");
    assert.equal(a?.status, "RUNNING");
    assert.equal(a?.attempts, 1);
  });

  it("finds a pending job for a workspace until it is done", async () => {
    const queue = new InMemoryJobRepository();
    const job = await queue.enqueue({ workspaceId: "w1", type: "scan", payload: null });
    assert.equal((await queue.findPending("w1", "scan"))?.id, job.id);
    assert.equal(await queue.findPending("w2", "scan"), null);
    await queue.claim("w", ["scan"], new Date());
    assert.equal((await queue.findPending("w1", "scan"))?.id, job.id, "running counts as pending");
    await queue.complete(job.id);
    assert.equal(await queue.findPending("w1", "scan"), null);
  });

  it("takes back a job whose worker stopped sending heartbeats", async () => {
    const queue = new InMemoryJobRepository();
    const job = await queue.enqueue({ workspaceId: "w1", type: "scan", payload: null, maxAttempts: 2 });
    const start = at(0);
    await queue.claim("dead", ["scan"], start);

    assert.equal(await queue.recoverStale(at(-1), start), 0, "still fresh");
    await queue.heartbeat(job.id, "dead", at(1));
    assert.equal(await queue.recoverStale(at(0.5), start), 0, "the heartbeat kept it");

    assert.equal(await queue.recoverStale(at(10), at(10)), 1);
    const again = await queue.claim("alive", ["scan"], at(10));
    assert.equal(again?.id, job.id);
    assert.equal(again?.attempts, 2);

    assert.equal(await queue.recoverStale(at(60), at(60)), 1);
    assert.equal(await queue.claim("x", ["scan"], at(120)), null, "no tries left: failed for good");
  });
});

describe("job queue: lost locks and cut-off inline runs", () => {
  it("doesn't let a worker that lost its job write the outcome", async () => {
    const queue = new InMemoryJobRepository();
    const job = await queue.enqueue({ workspaceId: "w1", type: "scan", payload: null });
    await queue.claim("slow", ["scan"], at(0));
    await queue.recoverStale(at(10), at(10));
    await queue.claim("fresh", ["scan"], at(10));
    assert.equal(await queue.complete(job.id, { by: "slow" }, "slow"), false);
    assert.equal(await queue.complete(job.id, { by: "fresh" }, "fresh"), true);
    assert.deepEqual((await queue.findById("w1", job.id))?.payload, { by: "fresh" });
  });

  it("forgets an inline run whose request was cut off, and fails it", async () => {
    const queue = new InMemoryJobRepository();
    const job = await queue.create({ workspaceId: "w1", type: "scan", status: "RUNNING", attempts: 1, startedAt: new Date(Date.now() - 40 * 60_000), payload: null });
    assert.equal(await queue.findPending("w1", "scan"), null, "no longer counts as running");
    assert.equal(await queue.recoverStale(new Date(), new Date()), 1);
    assert.equal((await queue.findById("w1", job.id))?.status, "FAILED");
    const recent = await queue.create({ workspaceId: "w1", type: "scan", status: "RUNNING", attempts: 1, startedAt: new Date(), payload: null });
    assert.equal((await queue.findPending("w1", "scan"))?.id, recent.id);
  });
});

describe("processNextJob", () => {
  it("is idle when nothing is due", async () => {
    const queue = new InMemoryJobRepository();
    assert.deepEqual(await processNextJob({ queue, handlers: { scan: async () => undefined }, workerId: "w" }), { outcome: "idle" });
  });

  it("completes a job and stores what the handler returned", async () => {
    const queue = new InMemoryJobRepository();
    const job = await queue.enqueue({ workspaceId: "w1", type: "scan", payload: { before: true } });
    const result = await processNextJob({ queue, handlers: { scan: async () => ({ after: true }) }, workerId: "w" });
    assert.equal(result.outcome, "completed");
    const stored = await queue.findById<{ after: boolean }>("w1", job.id);
    assert.equal(stored?.status, "COMPLETED");
    assert.deepEqual(stored?.payload, { after: true });
  });

  it("retries a failing job with a growing pause, then fails it for good", async () => {
    const queue = new InMemoryJobRepository();
    const job = await queue.enqueue({ workspaceId: "w1", type: "scan", payload: null, maxAttempts: 2 });
    let now = at(0);
    const clock = () => now;
    const handlers = { scan: async () => { throw new Error("TikTok timed out"); } };

    const first = await processNextJob({ queue, handlers, workerId: "w", clock });
    assert.equal(first.outcome, "retrying");
    if (first.outcome !== "retrying") return;
    assert.equal(first.retryAt.getTime() - now.getTime(), retryDelayMs(1));
    assert.equal((await processNextJob({ queue, handlers, workerId: "w", clock })).outcome, "idle", "not due yet");

    now = first.retryAt;
    const second = await processNextJob({ queue, handlers, workerId: "w", clock });
    assert.equal(second.outcome, "failed");
    const stored = await queue.findById("w1", job.id);
    assert.equal(stored?.status, "FAILED");
    assert.equal(stored?.error, "TikTok timed out");
  });

  it("doesn't retry a permanent error", async () => {
    const queue = new InMemoryJobRepository();
    await queue.enqueue({ workspaceId: "w1", type: "scan", payload: null });
    const result = await processNextJob({
      queue,
      handlers: { scan: async () => { throw new PermanentJobError("No creators to scan."); } },
      workerId: "w",
    });
    assert.equal(result.outcome, "failed");
  });

  it("waits 1, 5 and 25 minutes between tries", () => {
    assert.deepEqual([1, 2, 3].map(retryDelayMs), [60_000, 300_000, 1_500_000]);
  });
});
