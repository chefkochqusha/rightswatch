import { randomUUID } from "node:crypto";
import type {
  CaseNoteRecord,
  CaseNoteRepository,
  CaseRecord,
  CaseRepository,
} from "./types";

/**
 * Process-memory stand-ins for the Prisma-backed repositories Phase 4
 * will eventually provide — see `modules/auth/in-memory-repositories.ts`
 * for the full rationale (same sandbox limitation, same swap-later
 * pattern, same NOT-for-production caveat applies here verbatim).
 */

export class InMemoryCaseRepository implements CaseRepository {
  private readonly byId = new Map<string, CaseRecord>();

  async create(input: {
    workspaceId: string;
    rightsAssessmentId: string;
    assignedToId: string | null;
  }): Promise<CaseRecord> {
    const now = new Date();
    const record: CaseRecord = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      rightsAssessmentId: input.rightsAssessmentId,
      status: "OPEN",
      assignedToId: input.assignedToId,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(record.id, record);
    return record;
  }

  async findById(id: string): Promise<CaseRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async findByRightsAssessmentId(rightsAssessmentId: string): Promise<CaseRecord | null> {
    for (const record of this.byId.values()) {
      if (record.rightsAssessmentId === rightsAssessmentId) return record;
    }
    return null;
  }

  async findForWorkspace(workspaceId: string): Promise<CaseRecord[]> {
    return Array.from(this.byId.values()).filter((c) => c.workspaceId === workspaceId);
  }

  async update(
    id: string,
    changes: Partial<Pick<CaseRecord, "status" | "assignedToId">>,
  ): Promise<CaseRecord> {
    const existing = this.byId.get(id);
    if (!existing) {
      throw new Error(`InMemoryCaseRepository.update: no case with id "${id}"`);
    }
    const updated: CaseRecord = { ...existing, ...changes, updatedAt: new Date() };
    this.byId.set(id, updated);
    return updated;
  }
}

export class InMemoryCaseNoteRepository implements CaseNoteRepository {
  private readonly byId = new Map<string, CaseNoteRecord>();

  async create(input: {
    caseId: string;
    authorId: string;
    body: string;
  }): Promise<CaseNoteRecord> {
    const note: CaseNoteRecord = {
      id: randomUUID(),
      caseId: input.caseId,
      authorId: input.authorId,
      body: input.body,
      createdAt: new Date(),
    };
    this.byId.set(note.id, note);
    return note;
  }

  async findForCase(caseId: string): Promise<CaseNoteRecord[]> {
    return Array.from(this.byId.values())
      .filter((note) => note.caseId === caseId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}
