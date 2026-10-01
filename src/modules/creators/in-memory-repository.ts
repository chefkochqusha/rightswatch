import { randomUUID } from "node:crypto";
import type { Platform } from "../connectors/types";
import type { CreatorChanges, CreatorRecord, CreatorRepository, NewCreator } from "./types";
import { DuplicateCreatorError } from "./watchlist";

/** The same contract as `PrismaCreatorRepository`, for tests — including the
 *  unique key on (workspace, platform, external id). */
export class InMemoryCreatorRepository implements CreatorRepository {
  private readonly byId = new Map<string, CreatorRecord>();

  async create(input: NewCreator): Promise<CreatorRecord> {
    if (await this.findByExternalId(input.workspaceId, input.platform, input.externalId)) {
      throw new DuplicateCreatorError();
    }
    const now = new Date();
    const record: CreatorRecord = {
      id: randomUUID(),
      ...input,
      status: "PENDING",
      monitoringEnabled: true,
      lastSeenAt: null,
      lastError: null,
      removedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(record.id, record);
    return { ...record };
  }

  async findById(workspaceId: string, id: string): Promise<CreatorRecord | null> {
    const record = this.byId.get(id);
    return record && record.workspaceId === workspaceId ? { ...record } : null;
  }

  async findByExternalId(workspaceId: string, platform: Platform, externalId: string): Promise<CreatorRecord | null> {
    for (const record of this.byId.values()) {
      if (record.workspaceId === workspaceId && record.platform === platform && record.externalId === externalId) {
        return { ...record };
      }
    }
    return null;
  }

  async findForWorkspace(workspaceId: string): Promise<CreatorRecord[]> {
    return Array.from(this.byId.values())
      .filter((record) => record.workspaceId === workspaceId && !record.removedAt)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((record) => ({ ...record }));
  }

  async countMonitored(workspaceId: string): Promise<number> {
    return (await this.findForWorkspace(workspaceId)).filter((record) => record.monitoringEnabled).length;
  }

  async update(id: string, changes: CreatorChanges): Promise<CreatorRecord> {
    const existing = this.byId.get(id);
    if (!existing) throw new Error(`InMemoryCreatorRepository.update: no creator with id "${id}"`);
    const updated: CreatorRecord = { ...existing, ...changes, updatedAt: new Date() };
    this.byId.set(id, updated);
    return { ...updated };
  }
}
