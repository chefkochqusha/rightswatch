import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { priorityForVerdict } from "./priority";
import { openCase } from "./open-case";
import { updateCase } from "./update-case";
import { InMemoryCaseRepository } from "./in-memory-repositories";

describe("case priority", () => {
  test("a potential mismatch starts High, an unsettled check Medium", () => {
    assert.equal(priorityForVerdict("POTENTIAL_MISMATCH"), "HIGH");
    assert.equal(priorityForVerdict("UNKNOWN"), "MEDIUM");
    assert.equal(priorityForVerdict("REVIEW"), "MEDIUM");
  });

  test("openCase stores the priority it is given, and Medium otherwise", async () => {
    const caseRepository = new InMemoryCaseRepository();
    const high = await openCase({ workspaceId: "w", rightsAssessmentId: "a1", priority: "HIGH" }, { caseRepository });
    const plain = await openCase({ workspaceId: "w", rightsAssessmentId: "a2" }, { caseRepository });
    assert.equal(high.case.priority, "HIGH");
    assert.equal(plain.case.priority, "MEDIUM");
  });

  test("a second openCase never resets a priority a person changed", async () => {
    const caseRepository = new InMemoryCaseRepository();
    const first = await openCase({ workspaceId: "w", rightsAssessmentId: "a1", priority: "HIGH" }, { caseRepository });
    await updateCase({ caseId: first.case.id, priority: "CRITICAL" }, { caseRepository });
    const again = await openCase({ workspaceId: "w", rightsAssessmentId: "a1", priority: "HIGH" }, { caseRepository });
    assert.equal(again.created, false);
    assert.equal(again.case.priority, "CRITICAL");
  });

  test("updateCase can set the new statuses", async () => {
    const caseRepository = new InMemoryCaseRepository();
    const { case: created } = await openCase({ workspaceId: "w", rightsAssessmentId: "a1" }, { caseRepository });
    for (const status of ["WAITING", "CLEARED"] as const) {
      const result = await updateCase({ caseId: created.id, status }, { caseRepository });
      assert.ok(result.ok);
      assert.equal(result.case.status, status);
    }
  });
});
