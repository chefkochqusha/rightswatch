import type { CaseNoteRecord, CaseNoteRepository, CaseRepository } from "./types";

export interface AddCaseNoteInput {
  caseId: string;
  authorId: string;
  body: string;
}

export interface AddCaseNoteDependencies {
  caseRepository: CaseRepository;
  caseNoteRepository: CaseNoteRepository;
}

export type AddCaseNoteResult =
  | { ok: true; note: CaseNoteRecord }
  | { ok: false; error: "CASE_NOT_FOUND" | "EMPTY_NOTE" };

export async function addCaseNote(
  input: AddCaseNoteInput,
  deps: AddCaseNoteDependencies,
): Promise<AddCaseNoteResult> {
  const body = input.body.trim();
  if (body.length === 0) {
    return { ok: false, error: "EMPTY_NOTE" };
  }

  const existingCase = await deps.caseRepository.findById(input.caseId);
  if (!existingCase) {
    return { ok: false, error: "CASE_NOT_FOUND" };
  }

  const note = await deps.caseNoteRepository.create({
    caseId: input.caseId,
    authorId: input.authorId,
    body,
  });
  return { ok: true, note };
}
