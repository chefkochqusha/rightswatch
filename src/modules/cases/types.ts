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

export type CaseStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";

export interface CaseRecord {
  id: string;
  workspaceId: string;
  rightsAssessmentId: string;
  status: CaseStatus;
  assignedToId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaseNoteRecord {
  id: string;
  caseId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

export interface CaseRepository {
  create(input: {
    workspaceId: string;
    rightsAssessmentId: string;
    assignedToId: string | null;
  }): Promise<CaseRecord>;
  findById(id: string): Promise<CaseRecord | null>;
  /** The lookup `openCase` uses to enforce the 1:1 relationship. */
  findByRightsAssessmentId(rightsAssessmentId: string): Promise<CaseRecord | null>;
  findForWorkspace(workspaceId: string): Promise<CaseRecord[]>;
  update(
    id: string,
    changes: Partial<Pick<CaseRecord, "status" | "assignedToId">>,
  ): Promise<CaseRecord>;
}

export interface CaseNoteRepository {
  create(input: { caseId: string; authorId: string; body: string }): Promise<CaseNoteRecord>;
  /** Oldest first — the order a case's activity log reads in. */
  findForCase(caseId: string): Promise<CaseNoteRecord[]>;
}
