import { getPrisma } from "@/lib/prisma-client";
import type { Job, Prisma } from "@/generated/prisma/client";
import { INLINE_STALE_MS } from "./types";
import type { JobChanges, JobQueue, JobRecord, JobRepository, NewJob, QueuedJobInput } from "./types";

/**
 * Jobs in Postgres — the same contract as `InMemoryJobRepository`. The
 * payload is stored as JSON; dates inside it come back as ISO strings, so
 * payload types keep dates out (counts, ids and messages only).
 *
 * It is also the job queue: `claim` takes one row with
 * `FOR UPDATE SKIP LOCKED`, so any number of workers can poll at once and
 * each job still goes to exactly one of them.
 */
export class PrismaJobRepository implements JobRepository, JobQueue {
  async create<Payload>(input: NewJob<Payload>): Promise<JobRecord<Payload>> {
    const row = await getPrisma().job.create({
      data: {
        workspaceId: input.workspaceId,
        type: input.type,
        status: input.status,
        attempts: input.attempts,
        startedAt: input.startedAt,
        payload: toJson(input.payload),
      },
    });
    return mapJob<Payload>(row);
  }

  async update<Payload>(id: string, changes: JobChanges<Payload>): Promise<JobRecord<Payload>> {
    const { payload, ...rest } = changes;
    const row = await getPrisma().job.update({
      where: { id },
      data: { ...rest, ...(payload !== undefined ? { payload: toJson(payload) } : {}) },
    });
    return mapJob<Payload>(row);
  }

  async findById<Payload>(workspaceId: string, id: string): Promise<JobRecord<Payload> | null> {
    const row = await getPrisma().job.findFirst({ where: { id, workspaceId } });
    return row ? mapJob<Payload>(row) : null;
  }

  async findRecent<Payload>(workspaceId: string, type: string, limit: number): Promise<JobRecord<Payload>[]> {
    const rows = await getPrisma().job.findMany({
      where: { workspaceId, type },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map((row) => mapJob<Payload>(row));
  }

  async enqueue<Payload>(input: QueuedJobInput<Payload>): Promise<JobRecord<Payload>> {
    const row = await getPrisma().job.create({
      data: {
        workspaceId: input.workspaceId,
        type: input.type,
        status: "QUEUED",
        attempts: 0,
        payload: toJson(input.payload),
        ...(input.runAfter ? { runAfter: input.runAfter } : {}),
        ...(input.maxAttempts ? { maxAttempts: input.maxAttempts } : {}),
      },
    });
    return mapJob<Payload>(row);
  }

  async claim(workerId: string, types: readonly string[], now: Date): Promise<JobRecord | null> {
    const claimed = await getPrisma().$queryRaw<{ id: string }[]>`
      UPDATE "jobs"
      SET "status" = 'RUNNING', "attempts" = "attempts" + 1, "lockedAt" = ${now}::timestamp, "lockedBy" = ${workerId},
          "startedAt" = COALESCE("startedAt", ${now}::timestamp), "error" = NULL
      WHERE "id" = (
        SELECT "id" FROM "jobs"
        WHERE "status" IN ('QUEUED', 'RETRYING') AND "runAfter" <= ${now}::timestamp AND "type" = ANY(${[...types]}::text[])
        ORDER BY "runAfter", "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING "id"`;
    if (claimed.length === 0) return null;
    const row = await getPrisma().job.findUnique({ where: { id: claimed[0].id } });
    return row ? mapJob(row) : null;
  }

  async heartbeat(id: string, workerId: string, now: Date): Promise<void> {
    await getPrisma().job.updateMany({ where: { id, lockedBy: workerId, status: "RUNNING" }, data: { lockedAt: now } });
  }

  async complete<Payload>(id: string, payload?: Payload, workerId?: string): Promise<boolean> {
    const { count } = await getPrisma().job.updateMany({
      where: { id, ...(workerId ? { lockedBy: workerId, status: "RUNNING" as const } : {}) },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        error: null,
        lockedAt: null,
        lockedBy: null,
        ...(payload !== undefined ? { payload: toJson(payload) } : {}),
      },
    });
    return count > 0;
  }

  async fail(id: string, error: string, retryAt: Date | null, workerId?: string): Promise<boolean> {
    const { count } = await getPrisma().job.updateMany({
      where: { id, ...(workerId ? { lockedBy: workerId, status: "RUNNING" as const } : {}) },
      data: retryAt
        ? { status: "RETRYING", error: error.slice(0, 2000), runAfter: retryAt, lockedAt: null, lockedBy: null }
        : { status: "FAILED", error: error.slice(0, 2000), completedAt: new Date(), lockedAt: null, lockedBy: null },
    });
    return count > 0;
  }

  async recoverStale(staleBefore: Date, now: Date, inlineStaleBefore: Date = new Date(now.getTime() - INLINE_STALE_MS)): Promise<number> {
    const error = "The worker stopped while running this job.";
    const recovered = await getPrisma().$executeRaw`
      UPDATE "jobs"
      SET "status" = CASE WHEN "attempts" < "maxAttempts" THEN 'RETRYING'::"JobStatus" ELSE 'FAILED'::"JobStatus" END,
          "runAfter" = ${now}::timestamp,
          "completedAt" = CASE WHEN "attempts" < "maxAttempts" THEN NULL ELSE ${now}::timestamp END,
          "error" = ${error}, "lockedAt" = NULL, "lockedBy" = NULL
      WHERE "status" = 'RUNNING' AND "lockedAt" IS NOT NULL AND "lockedAt" < ${staleBefore}::timestamp`;
    const { count: cutOff } = await getPrisma().job.updateMany({
      where: { status: "RUNNING", lockedAt: null, startedAt: { lt: inlineStaleBefore } },
      data: { status: "FAILED", completedAt: now, error: "The request running this job was cut off." },
    });
    return recovered + cutOff;
  }

  async findPending<Payload>(workspaceId: string, type: string): Promise<JobRecord<Payload> | null> {
    const row = await getPrisma().job.findFirst({
      where: {
        workspaceId,
        type,
        OR: [
          { status: { in: ["QUEUED", "RETRYING"] } },
          { status: "RUNNING", lockedAt: { not: null } },
          { status: "RUNNING", lockedAt: null, startedAt: { gte: new Date(Date.now() - INLINE_STALE_MS) } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    return row ? mapJob<Payload>(row) : null;
  }
}

function toJson(payload: unknown): Prisma.InputJsonValue | undefined {
  return payload === null || payload === undefined ? undefined : (payload as Prisma.InputJsonValue);
}

function mapJob<Payload>(row: Job): JobRecord<Payload> {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    error: row.error,
    payload: (row.payload ?? null) as Payload | null,
    createdAt: row.createdAt,
    runAfter: row.runAfter,
    maxAttempts: row.maxAttempts,
  };
}
