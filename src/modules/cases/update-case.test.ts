import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { openCase } from "./open-case";
import { updateCase } from "./update-case";
import { InMemoryCaseRepository } from "./in-memory-repositories";

async function makeCase() {
  const caseRepository = new InMemoryCaseRepository();
  const { case: openedCase } = await openCase(
    { workspaceId: "workspace-1", rightsAssessmentId: "assessment-1" },
    { caseRepository },
  );
  return { caseRepository, caseId: openedCase.id };
}

describe("updateCase", () => {
  test("changes the status", async () => {
    const { caseRepository, caseId } = await makeCase();
    const result = await updateCase({ caseId, status: "IN_PROGRESS" }, { caseRepository });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.case.status, "IN_PROGRESS");
  });

  test("assigns and unassigns a case", async () => {
    const { caseRepository, caseId } = await makeCase();

    const assigned = await updateCase({ caseId, assignedToId: "user-1" }, { caseRepository });
    assert.equal(assigned.ok, true);
    if (assigned.ok) assert.equal(assigned.case.assignedToId, "user-1");

    const unassigned = await updateCase({ caseId, assignedToId: null }, { caseRepository });
    assert.equal(unassigned.ok, true);
    if (unassigned.ok) assert.equal(unassigned.case.assignedToId, null);
  });

  test("can change status and assignee in the same call", async () => {
    const { caseRepository, caseId } = await makeCase();
    const result = await updateCase(
      { caseId, status: "IN_PROGRESS", assignedToId: "user-1" },
      { caseRepository },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.case.status, "IN_PROGRESS");
      assert.equal(result.case.assignedToId, "user-1");
    }
  });

  test("leaves a field untouched when it's omitted", async () => {
    const { caseRepository, caseId } = await makeCase();
    await updateCase({ caseId, assignedToId: "user-1" }, { caseRepository });
    const result = await updateCase({ caseId, status: "RESOLVED" }, { caseRepository });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.case.status, "RESOLVED");
      assert.equal(result.case.assignedToId, "user-1", "assignee from the earlier call is preserved");
    }
  });

  test("allows moving a resolved or dismissed case back to open (reopening)", async () => {
    const { caseRepository, caseId } = await makeCase();
    await updateCase({ caseId, status: "DISMISSED" }, { caseRepository });
    const reopened = await updateCase({ caseId, status: "OPEN" }, { caseRepository });
    assert.equal(reopened.ok, true);
    if (reopened.ok) assert.equal(reopened.case.status, "OPEN");
  });

  test("fails for a case that doesn't exist", async () => {
    const caseRepository = new InMemoryCaseRepository();
    const result = await updateCase({ caseId: "no-such-case", status: "OPEN" }, { caseRepository });
    assert.deepEqual(result, { ok: false, error: "CASE_NOT_FOUND" });
  });
});
