/**
 * Case management domain types (Brief §43 "Database entities": Case,
 * CaseNote, CaseEvidence — this file covers the first two; CaseEvidence
 * is out of scope until there's an object-storage decision to back it,
 * see `.env.example`'s blank `STORAGE_*` vars). Field names mirror
 * `prisma/schema.prisma`'s `Case`/`CaseNote` models exactly, so a
 * Prisma-backed repository is a drop-in replacement for the in-memory one
 * in `in-memory-repositories.ts` — same pattern as every other module.
 *
 * This is the "turn a detection into actionable work" layer: the Rights
 * Engine and scan pipeline produce assessments, but an assessment on its
 * own is just a verdict — a Case is what a human on the customer's team
 * actually works with (assign it, note on it, move it to resolved or
 * dismissed). `rightsAssessmentId` is 1:1 (schema: `@unique`) — an
 * assessment gets at most one case, ever, which is why `openCase` below
 * is idempotent rather than erroring on a second call.
 */

/**
 * Brief §12's case statuses: Open, In review (`IN_PROGRESS`), Waiting (on
 * someone outside the team), Cleared (looked at, nothing wrong), Resolved
 * (acted on) and Dismissed (not worth pursuing).
 */
export type CaseStatus = "OPEN" | "IN_PROGRESS" | "WAITING" | "CLEARED" | "RESOLVED" | "DISMISSED";

/** Statuses of a case somebody still has to do something about. */
export const ACTIVE_CASE_STATUSES: readonly CaseStatus[] = ["OPEN", "IN_PROGRESS", "WAITING"];

/** Brief §12's priorities. */
export type CasePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** Most urgent first. */
export const CASE_PRIORITY_ORDER: Record<CasePriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export interface CaseRecord {
  id: string;
  workspaceId: string;
  rightsAssessmentId: string;
  status: CaseStatus;
  priority: CasePriority;
  assignedToId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaseNoteRecord {
  id: string;
  caseId: string;
  /** Null once the author deleted their own account. */
  authorId: string | null;
  body: string;
  createdAt: Date;
}

export interface CaseRepository {
  create(input: {
    workspaceId: string;
    rightsAssessmentId: string;
    assignedToId: string | null;
    priority: CasePriority;
  }): Promise<CaseRecord>;
  findById(id: string): Promise<CaseRecord | null>;
  /** The lookup `openCase` uses to enforce the 1:1 relationship. */
  findByRightsAssessmentId(rightsAssessmentId: string): Promise<CaseRecord | null>;
  findForWorkspace(workspaceId: string): Promise<CaseRecord[]>;
  update(
    id: string,
    changes: Partial<Pick<CaseRecord, "status" | "priority" | "assignedToId">>,
  ): Promise<CaseRecord>;
}

export interface CaseNoteRepository {
  create(input: { caseId: string; authorId: string; body: string }): Promise<CaseNoteRecord>;
  /** Oldest first — the order a case's activity log reads in. */
  findForCase(caseId: string): Promise<CaseNoteRecord[]>;
}
