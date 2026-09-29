import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { openCase } from "./open-case";
import { InMemoryCaseRepository } from "./in-memory-repositories";

describe("openCase", () => {
  test("creates a new OPEN case for an assessment that has none yet", async () => {
    const caseRepository = new InMemoryCaseRepository();
    const result = await openCase(
      { workspaceId: "workspace-1", rightsAssessmentId: "assessment-1" },
      { caseRepository },
    );

    assert.equal(result.created, true);
    assert.equal(result.case.status, "OPEN");
    assert.equal(result.case.rightsAssessmentId, "assessment-1");
  });

  test("passes through an initial assignee when given one", async () => {
    const caseRepository = new InMemoryCaseRepository();
    const result = await openCase(
      { workspaceId: "workspace-1", rightsAssessmentId: "assessment-1", assignedToId: "user-1" },
      { caseRepository },
    );
    assert.equal(result.case.assignedToId, "user-1");
  });

  test("is idempotent: a second call for the same assessment returns the existing case", async () => {
    const caseRepository = new InMemoryCaseRepository();
    const first = await openCase(
      { workspaceId: "workspace-1", rightsAssessmentId: "assessment-1" },
      { caseRepository },
    );
    const second = await openCase(
      { workspaceId: "workspace-1", rightsAssessmentId: "assessment-1" },
      { caseRepository },
    );

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.case.id, first.case.id);

    const all = await caseRepository.findForWorkspace("workspace-1");
    assert.equal(all.length, 1, "no duplicate case was created");
  });

  test("different assessments get different cases", async () => {
    const caseRepository = new InMemoryCaseRepository();
    const a = await openCase(
      { workspaceId: "workspace-1", rightsAssessmentId: "assessment-1" },
      { caseRepository },
    );
    const b = await openCase(
      { workspaceId: "workspace-1", rightsAssessmentId: "assessment-2" },
      { caseRepository },
    );
    assert.notEqual(a.case.id, b.case.id);
  });
});
