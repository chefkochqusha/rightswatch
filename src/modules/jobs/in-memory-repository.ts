import { randomUUID } from "node:crypto";
import type { JobChanges, JobRecord, JobRepository, NewJob } from "./types";

/** The same contract as `PrismaJobRepository`, for tests. */
export class InMemoryJobRepository implements JobRepository {
  private readonly byId = new Map<string, JobRecord>();

  async create<Payload>(input: NewJob<Payload>): Promise<JobRecord<Payload>> {
    const record: JobRecord<Payload> = {
      id: randomUUID(),
      ...input,
      completedAt: null,
      error: null,
      createdAt: new Date(),
    };
    this.byId.set(record.id, record as JobRecord);
    return { ...record };
  }

  async update<Payload>(id: string, changes: JobChanges<Payload>): Promise<JobRecord<Payload>> {
    const existing = this.byId.get(id) as JobRecord<Payload> | undefined;
    if (!existing) throw new Error(`InMemoryJobRepository.update: no job with id "${id}"`);
    const updated: JobRecord<Payload> = { ...existing, ...changes };
    this.byId.set(id, updated as JobRecord);
    return { ...updated };
  }

  async findById<Payload>(workspaceId: string, id: string): Promise<JobRecord<Payload> | null> {
    const record = this.byId.get(id);
    return record && record.workspaceId === workspaceId ? ({ ...record } as JobRecord<Payload>) : null;
  }

  async findRecent<Payload>(workspaceId: string, type: string, limit: number): Promise<JobRecord<Payload>[]> {
    return Array.from(this.byId.values())
      .filter((job) => job.workspaceId === workspaceId && job.type === type)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((job) => ({ ...job }) as JobRecord<Payload>);
  }
}
