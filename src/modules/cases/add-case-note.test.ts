import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { openCase } from "./open-case";
import { addCaseNote } from "./add-case-note";
import { InMemoryCaseRepository, InMemoryCaseNoteRepository } from "./in-memory-repositories";

async function makeCase() {
  const caseRepository = new InMemoryCaseRepository();
  const caseNoteRepository = new InMemoryCaseNoteRepository();
  const { case: openedCase } = await openCase(
    { workspaceId: "workspace-1", rightsAssessmentId: "assessment-1" },
    { caseRepository },
  );
  return { caseRepository, caseNoteRepository, caseId: openedCase.id };
}

describe("addCaseNote", () => {
  test("adds a note to an existing case", async () => {
    const { caseRepository, caseNoteRepository, caseId } = await makeCase();
    const result = await addCaseNote(
      { caseId, authorId: "user-1", body: "Reached out to the label for confirmation." },
      { caseRepository, caseNoteRepository },
    );

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.note.body, "Reached out to the label for confirmation.");

    const notes = await caseNoteRepository.findForCase(caseId);
    assert.equal(notes.length, 1);
  });

  test("trims whitespace from the note body", async () => {
    const { caseRepository, caseNoteRepository, caseId } = await makeCase();
    const result = await addCaseNote(
      { caseId, authorId: "user-1", body: "  Note with padding  \n" },
      { caseRepository, caseNoteRepository },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.note.body, "Note with padding");
  });

  test("rejects an empty or whitespace-only note", async () => {
    const { caseRepository, caseNoteRepository, caseId } = await makeCase();
    const result = await addCaseNote(
      { caseId, authorId: "user-1", body: "   " },
      { caseRepository, caseNoteRepository },
    );
    assert.deepEqual(result, { ok: false, error: "EMPTY_NOTE" });

    const notes = await caseNoteRepository.findForCase(caseId);
    assert.equal(notes.length, 0, "no note was created");
  });

  test("rejects a note for a case that doesn't exist", async () => {
    const caseRepository = new InMemoryCaseRepository();
    const caseNoteRepository = new InMemoryCaseNoteRepository();
    const result = await addCaseNote(
      { caseId: "no-such-case", authorId: "user-1", body: "Anything" },
      { caseRepository, caseNoteRepository },
    );
    assert.deepEqual(result, { ok: false, error: "CASE_NOT_FOUND" });
  });
});
