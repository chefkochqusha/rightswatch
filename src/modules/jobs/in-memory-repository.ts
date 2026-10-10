import { randomUUID } from "node:crypto";
import type { JobChanges, JobQueue, JobRecord, JobRepository, NewJob, QueuedJobInput } from "./types";

/** The same contract as `PrismaJobRepository`, for tests. */
type QueueState = { lockedAt: Date | null; lockedBy: string | null };

export class InMemoryJobRepository implements JobRepository, JobQueue {
  private readonly byId = new Map<string, JobRecord>();
  private readonly locks = new Map<string, QueueState>();


  async create<Payload>(input: NewJob<Payload>): Promise<JobRecord<Payload>> {
    const record: JobRecord<Payload> = {
      id: randomUUID(),
      ...input,
      completedAt: null,
      error: null,
      createdAt: new Date(),
      runAfter: new Date(),
      maxAttempts: 3,
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

  async enqueue<Payload>(input: QueuedJobInput<Payload>): Promise<JobRecord<Payload>> {
    const createdAt = new Date();
    const record: JobRecord<Payload> = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      type: input.type,
      status: "QUEUED",
      attempts: 0,
      startedAt: null,
      completedAt: null,
      error: null,
      payload: input.payload,
      createdAt,
      runAfter: input.runAfter ?? createdAt,
      maxAttempts: input.maxAttempts ?? 3,
    };
    this.byId.set(record.id, record as JobRecord);
    return { ...record };
  }

  async claim(workerId: string, types: readonly string[], now: Date): Promise<JobRecord | null> {
    const next = Array.from(this.byId.values())
      .filter((job) => (job.status === "QUEUED" || job.status === "RETRYING") && types.includes(job.type) && job.runAfter <= now)
      // Stable sort: equal `runAfter` keeps insertion order, i.e. oldest first.
      .sort((a, b) => a.runAfter.getTime() - b.runAfter.getTime())[0];
    if (!next) return null;
    const claimed: JobRecord = { ...next, status: "RUNNING", attempts: next.attempts + 1, startedAt: next.startedAt ?? now };
    this.byId.set(next.id, claimed);
    this.locks.set(next.id, { lockedAt: now, lockedBy: workerId });
    return { ...claimed };
  }

  async heartbeat(id: string, workerId: string, now: Date): Promise<void> {
    const lock = this.locks.get(id);
    if (lock && lock.lockedBy === workerId) this.locks.set(id, { lockedAt: now, lockedBy: workerId });
  }

  async complete<Payload>(id: string, payload?: Payload): Promise<void> {
    await this.update<Payload>(id, { status: "COMPLETED", completedAt: new Date(), error: null, ...(payload !== undefined ? { payload } : {}) });
    this.locks.delete(id);
  }

  async fail(id: string, error: string, retryAt: Date | null): Promise<void> {
    const job = this.byId.get(id);
    if (!job) return;
    this.byId.set(id, retryAt
      ? { ...job, status: "RETRYING", error, runAfter: retryAt }
      : { ...job, status: "FAILED", error, completedAt: new Date() });
    this.locks.delete(id);
  }

  async recoverStale(staleBefore: Date, now: Date): Promise<number> {
    let recovered = 0;
    for (const job of this.byId.values()) {
      const lock = this.locks.get(job.id);
      if (job.status !== "RUNNING" || !lock?.lockedAt || lock.lockedAt >= staleBefore) continue;
      const error = "The worker stopped while running this job.";
      this.byId.set(job.id, job.attempts < job.maxAttempts
        ? { ...job, status: "RETRYING", error, runAfter: now }
        : { ...job, status: "FAILED", error, completedAt: now });
      this.locks.delete(job.id);
      recovered += 1;
    }
    return recovered;
  }

  async findPending<Payload>(workspaceId: string, type: string): Promise<JobRecord<Payload> | null> {
    const job = Array.from(this.byId.values()).find(
      (j) => j.workspaceId === workspaceId && j.type === type && (j.status === "QUEUED" || j.status === "RETRYING" || j.status === "RUNNING"),
    );
    return job ? ({ ...job } as JobRecord<Payload>) : null;
  }
}
