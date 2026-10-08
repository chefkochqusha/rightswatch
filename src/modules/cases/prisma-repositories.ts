import { getPrisma } from "@/lib/prisma-client";
import type { PrismaClient } from "@/generated/prisma/client";
import type {
  CaseNoteRecord,
  CaseNoteRepository,
  CaseRecord,
  CaseRepository,
  CasePriority,
  CaseStatus,
} from "./types";

/**
 * Prisma-backed repositories (Phase 2) for `Case` and `CaseNote` — drop-in
 * replacements for `InMemoryCaseRepository`/`InMemoryCaseNoteRepository`,
 * matching `types.ts`'s interfaces exactly.
 *
 * `Case.rightsAssessmentId` is a foreign key to `RightsAssessment.id`, so
 * `create` only succeeds for an assessment that exists as a row — which is
 * why this was only wired into `app/_lib/case-store.ts` once
 * `modules/scan-results` stored the scan pipeline's assessments. (Wired in
 * before that, 6b69b95, every case creation failed in production with a
 * foreign-key violation.)
 *
 * `getPrisma()`, not a top-level `prisma` binding — see
 * `src/lib/prisma-client.ts`'s doc comment for why.
 */

// Same representation-bridging rationale as `modules/auth/prisma-
// repositories.ts`'s `PrismaRole` helpers, including the `declare const`
// phantom-value workaround for why this isn't `typeof getPrisma().case.create`
// or `PrismaClient["case"]["create"]` (see that file's comment for the full
// empirical explanation of both). `CaseStatus` is the one schema enum this
// module touches.
declare const _phantomPrismaClient: PrismaClient;
type PrismaCaseStatus = Parameters<typeof _phantomPrismaClient.case.create>[0]["data"]["status"] & string;
function toPrismaCaseStatus(status: CaseStatus): PrismaCaseStatus {
  return status as PrismaCaseStatus;
}
function fromPrismaCaseStatus(status: string): CaseStatus {
  return status as CaseStatus;
}
type PrismaCasePriority = Parameters<typeof _phantomPrismaClient.case.create>[0]["data"]["priority"] & string;
function toPrismaCasePriority(priority: CasePriority): PrismaCasePriority {
  return priority as PrismaCasePriority;
}

export class PrismaCaseRepository implements CaseRepository {
  async create(input: {
    workspaceId: string;
    rightsAssessmentId: string;
    assignedToId: string | null;
    priority: CasePriority;
  }): Promise<CaseRecord> {
    const row = await getPrisma().case.create({
      data: {
        workspaceId: input.workspaceId,
        rightsAssessmentId: input.rightsAssessmentId,
        priority: toPrismaCasePriority(input.priority),
        assignedToId: input.assignedToId,
      },
    });
    return mapCase(row);
  }

  async findById(id: string): Promise<CaseRecord | null> {
    const row = await getPrisma().case.findUnique({ where: { id } });
    return row ? mapCase(row) : null;
  }

  async findByRightsAssessmentId(rightsAssessmentId: string): Promise<CaseRecord | null> {
    const row = await getPrisma().case.findUnique({ where: { rightsAssessmentId } });
    return row ? mapCase(row) : null;
  }

  async findForWorkspace(workspaceId: string): Promise<CaseRecord[]> {
    const rows = await getPrisma().case.findMany({ where: { workspaceId } });
    return rows.map(mapCase);
  }

  async update(
    id: string,
    changes: Partial<Pick<CaseRecord, "status" | "priority" | "assignedToId">>,
  ): Promise<CaseRecord> {
    const row = await getPrisma().case.update({
      where: { id },
      data: {
        ...changes,
        status: changes.status ? toPrismaCaseStatus(changes.status) : undefined,
        priority: changes.priority ? toPrismaCasePriority(changes.priority) : undefined,
      },
    });
    return mapCase(row);
  }
}

export class PrismaCaseNoteRepository implements CaseNoteRepository {
  async create(input: { caseId: string; authorId: string; body: string }): Promise<CaseNoteRecord> {
    const row = await getPrisma().caseNote.create({
      data: {
        caseId: input.caseId,
        authorId: input.authorId,
        body: input.body,
      },
    });
    return mapCaseNote(row);
  }

  async findForCase(caseId: string): Promise<CaseNoteRecord[]> {
    // Oldest first — matches the in-memory version's contract (the order a
    // case's activity log reads in).
    const rows = await getPrisma().caseNote.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapCaseNote);
  }
}

function mapCase(row: {
  id: string;
  workspaceId: string;
  rightsAssessmentId: string;
  status: string;
  priority: string;
  assignedToId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CaseRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    rightsAssessmentId: row.rightsAssessmentId,
    status: fromPrismaCaseStatus(row.status),
    priority: row.priority as CasePriority,
    assignedToId: row.assignedToId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCaseNote(row: {
  id: string;
  caseId: string;
  authorId: string | null;
  body: string;
  createdAt: Date;
}): CaseNoteRecord {
  return {
    id: row.id,
    caseId: row.caseId,
    authorId: row.authorId,
    body: row.body,
    createdAt: row.createdAt,
  };
}
