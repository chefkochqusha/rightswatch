import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { InMemoryAuditLogRepository } from "./in-memory-repository";

describe("InMemoryAuditLogRepository", () => {
  test("create() returns a record with a generated id, timestamp, and null metadata by default", async () => {
    const repo = new InMemoryAuditLogRepository();
    const before = Date.now();
    const record = await repo.create({
      workspaceId: "ws-1",
      actorId: "user-1",
      action: "case.status_changed",
      targetType: "case",
      targetId: "case-1",
    });
    assert.ok(record.id);
    assert.equal(record.workspaceId, "ws-1");
    assert.equal(record.actorId, "user-1");
    assert.equal(record.action, "case.status_changed");
    assert.equal(record.targetType, "case");
    assert.equal(record.targetId, "case-1");
    assert.equal(record.metadata, null);
    assert.ok(record.createdAt.getTime() >= before);
  });

  test("create() stores the given metadata and a null actorId when given one", async () => {
    const repo = new InMemoryAuditLogRepository();
    const record = await repo.create({
      workspaceId: "ws-1",
      actorId: null,
      action: "case.status_changed",
      targetType: "case",
      targetId: "case-1",
      metadata: { from: "OPEN", to: "RESOLVED" },
    });
    assert.equal(record.actorId, null);
    assert.deepEqual(record.metadata, { from: "OPEN", to: "RESOLVED" });
  });

  test("findForWorkspace() returns only that workspace's entries, newest first", async () => {
    const repo = new InMemoryAuditLogRepository();
    const first = await repo.create({
      workspaceId: "ws-1",
      actorId: "user-1",
      action: "case.opened",
      targetType: "case",
      targetId: "case-1",
    });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await repo.create({
      workspaceId: "ws-1",
      actorId: "user-1",
      action: "case.status_changed",
      targetType: "case",
      targetId: "case-1",
    });
    // A different workspace's entry should never show up here.
    await repo.create({
      workspaceId: "ws-2",
      actorId: "user-2",
      action: "case.opened",
      targetType: "case",
      targetId: "case-9",
    });

    const results = await repo.findForWorkspace("ws-1");
    assert.equal(results.length, 2);
    assert.equal(results[0].id, second.id);
    assert.equal(results[1].id, first.id);
  });

  test("findForWorkspace() returns an empty array for a workspace with no entries", async () => {
    const repo = new InMemoryAuditLogRepository();
    assert.deepEqual(await repo.findForWorkspace("ws-empty"), []);
  });
});
