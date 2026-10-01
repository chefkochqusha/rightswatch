import { randomUUID } from "node:crypto";
import type { RightsRecordRepository, RightsRecordRow, RightsRecordValues } from "./library";

/** Rights records in memory — the same contract as `PrismaRightsRecordRepository`, for tests. */
export class InMemoryRightsRecordRepository implements RightsRecordRepository {
  private readonly rows = new Map<string, RightsRecordRow>();

  async findForTrack(workspaceId: string, trackId: string): Promise<RightsRecordRow[]> {
    return (await this.findForWorkspace(workspaceId)).filter((row) => row.trackId === trackId);
  }

  async findForWorkspace(workspaceId: string): Promise<RightsRecordRow[]> {
    return [...this.rows.values()]
      .filter((row) => row.workspaceId === workspaceId)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findById(workspaceId: string, id: string): Promise<RightsRecordRow | null> {
    const row = this.rows.get(id);
    return row && row.workspaceId === workspaceId ? row : null;
  }

  async create(input: RightsRecordValues & { workspaceId: string; trackId: string }): Promise<RightsRecordRow> {
    const now = new Date();
    const row: RightsRecordRow = { ...input, id: randomUUID(), createdAt: now, updatedAt: now };
    this.rows.set(row.id, row);
    return row;
  }

  async update(id: string, values: RightsRecordValues): Promise<RightsRecordRow> {
    const existing = this.rows.get(id);
    if (!existing) throw new Error(`InMemoryRightsRecordRepository.update: no record with id "${id}"`);
    const row = { ...existing, ...values, updatedAt: new Date() };
    this.rows.set(id, row);
    return row;
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }
}
