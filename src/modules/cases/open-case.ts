import type { CasePriority, CaseRecord, CaseRepository } from "./types";

export interface OpenCaseInput {
  workspaceId: string;
  rightsAssessmentId: string;
  assignedToId?: string | null;
  /** Defaults to MEDIUM; `priorityForVerdict` suggests one from the verdict. */
  priority?: CasePriority;
}

export interface OpenCaseDependencies {
  caseRepository: CaseRepository;
}

export type OpenCaseResult =
  | { created: true; case: CaseRecord }
  | { created: false; case: CaseRecord };

/**
 * Idempotent by design: `Case.rightsAssessmentId` is 1:1 (schema
 * `@unique`), so opening a case for an assessment that already has one
 * returns the existing case rather than erroring or creating a second
 * one. This matters because "open a case" is naturally something that
 * could be triggered more than once for the same assessment — a human
 * clicking a button twice, or (later) an automated rule re-evaluating an
 * assessment — and the Brief's idempotency theme (§22, already load-
 * bearing for Creator/Content/MusicMatch/WebhookEvent uniqueness) applies
 * here just as much even though Case itself isn't in that section's list.
 */
export async function openCase(
  input: OpenCaseInput,
  deps: OpenCaseDependencies,
): Promise<OpenCaseResult> {
  const existing = await deps.caseRepository.findByRightsAssessmentId(input.rightsAssessmentId);
  if (existing) {
    return { created: false, case: existing };
  }

  const created = await deps.caseRepository.create({
    workspaceId: input.workspaceId,
    rightsAssessmentId: input.rightsAssessmentId,
    assignedToId: input.assignedToId ?? null,
    priority: input.priority ?? "MEDIUM",
  });
  return { created: true, case: created };
}
