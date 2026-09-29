import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { InMemoryCaseRepository, InMemoryCaseNoteRepository } from "./in-memory-repositories";

describe("InMemoryCaseRepository", () => {
  test("creates a case in OPEN status", async () => {
    const repo = new InMemoryCaseRepository();
    const created = await repo.create({
      workspaceId: "workspace-1",
      rightsAssessmentId: "assessment-1",
      assignedToId: null,
    });
    assert.equal(created.status, "OPEN");
    assert.equal(created.workspaceId, "workspace-1");
    assert.equal(created.assignedToId, null);
  });

  test("finds a case by id and by rightsAssessmentId", async () => {
    const repo = new InMemoryCaseRepository();
    const created = await repo.create({
      workspaceId: "workspace-1",
      rightsAssessmentId: "assessment-1",
      assignedToId: "user-1",
    });

    assert.equal((await repo.findById(created.id))?.id, created.id);
    assert.equal((await repo.findByRightsAssessmentId("assessment-1"))?.id, created.id);
    assert.equal(await repo.findByRightsAssessmentId("no-such-assessment"), null);
    assert.equal(await repo.findById("no-such-id"), null);
  });

  test("findForWorkspace only returns that workspace's cases", async () => {
    const repo = new InMemoryCaseRepository();
    await repo.create({ workspaceId: "workspace-1", rightsAssessmentId: "a1", assignedToId: null });
    await repo.create({ workspaceId: "workspace-1", rightsAssessmentId: "a2", assignedToId: null });
    await repo.create({ workspaceId: "workspace-2", rightsAssessmentId: "a3", assignedToId: null });

    const forWorkspace1 = await repo.findForWorkspace("workspace-1");
    assert.equal(forWorkspace1.length, 2);
    assert.ok(forWorkspace1.every((c) => c.workspaceId === "workspace-1"));
  });

  test("update patches only the given fields and bumps updatedAt", async () => {
    const repo = new InMemoryCaseRepository();
    const created = await repo.create({
      workspaceId: "workspace-1",
      rightsAssessmentId: "a1",
      assignedToId: null,
    });

    const updated = await repo.update(created.id, { status: "IN_PROGRESS" });
    assert.equal(updated.status, "IN_PROGRESS");
    assert.equal(updated.assignedToId, null, "untouched field is preserved");
    assert.ok(updated.updatedAt.getTime() >= created.updatedAt.getTime());
  });

  test("update throws for an unknown case id", async () => {
    const repo = new InMemoryCaseRepository();
    await assert.rejects(() => repo.update("no-such-id", { status: "RESOLVED" }));
  });
});

describe("InMemoryCaseNoteRepository", () => {
  test("creates a note and finds it for its case", async () => {
    const repo = new InMemoryCaseNoteRepository();
    const note = await repo.create({ caseId: "case-1", authorId: "user-1", body: "Contacted the label." });

    const forCase = await repo.findForCase("case-1");
    assert.equal(forCase.length, 1);
    assert.equal(forCase[0].id, note.id);
    assert.equal(forCase[0].body, "Contacted the label.");
  });

  test("findForCase returns notes oldest first and only for that case", async () => {
    const repo = new InMemoryCaseNoteRepository();
    await repo.create({ caseId: "case-1", authorId: "user-1", body: "First note" });
    await repo.create({ caseId: "case-2", authorId: "user-1", body: "Different case" });
    await repo.create({ caseId: "case-1", authorId: "user-2", body: "Second note" });

    const forCase1 = await repo.findForCase("case-1");
    assert.equal(forCase1.length, 2);
    assert.equal(forCase1[0].body, "First note");
    assert.equal(forCase1[1].body, "Second note");
  });

  test("findForCase returns an empty array for a case with no notes", async () => {
    const repo = new InMemoryCaseNoteRepository();
    assert.deepEqual(await repo.findForCase("no-notes-here"), []);
  });
});
