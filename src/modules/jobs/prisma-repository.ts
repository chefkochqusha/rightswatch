import { getPrisma } from "@/lib/prisma-client";
import type { Job, Prisma } from "@/generated/prisma/client";
import type { JobChanges, JobRecord, JobRepository, NewJob } from "./types";

/**
 * Jobs in Postgres — the same contract as `InMemoryJobRepository`. The
 * payload is stored as JSON; dates inside it come back as ISO strings, so
 * payload types keep dates out (counts, ids and messages only).
 */
export class PrismaJobRepository implements JobRepository {
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
  };
}
