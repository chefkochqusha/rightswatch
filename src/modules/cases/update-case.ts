import type { CaseRecord, CaseRepository, CaseStatus } from "./types";

export interface UpdateCaseInput {
  caseId: string;
  /** Omit to leave the status untouched. */
  status?: CaseStatus;
  /** Omit to leave the assignee untouched; pass `null` to unassign. */
  assignedToId?: string | null;
}

export interface UpdateCaseDependencies {
  caseRepository: CaseRepository;
}

export type UpdateCaseResult = { ok: true; case: CaseRecord } | { ok: false; error: "CASE_NOT_FOUND" };

/**
 * Covers both re-assignment and status changes, since both are the same
 * shape of operation (patch a couple of fields on an existing case) and a
 * UI action often does both at once ("assign to me and start working it").
 *
 * Deliberately does not enforce a status state machine (e.g. forbidding
 * DISMISSED -> IN_PROGRESS): the Brief defines the four `CaseStatus`
 * values but no transition rules, and a real support/ticket workflow
 * usually needs to allow reopening a resolved or dismissed case when a
 * resolution turns out to be wrong. Inventing transition restrictions
 * nobody asked for would be speculative scope, not a safety rail.
 */
export async function updateCase(
  input: UpdateCaseInput,
  deps: UpdateCaseDependencies,
): Promise<UpdateCaseResult> {
  const existingCase = await deps.caseRepository.findById(input.caseId);
  if (!existingCase) {
    return { ok: false, error: "CASE_NOT_FOUND" };
  }

  const changes: Partial<Pick<CaseRecord, "status" | "assignedToId">> = {};
  if (input.status !== undefined) changes.status = input.status;
  if (input.assignedToId !== undefined) changes.assignedToId = input.assignedToId;

  const updated = await deps.caseRepository.update(input.caseId, changes);
  return { ok: true, case: updated };
}
