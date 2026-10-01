/**
 * Jobs (Master Brief §21): the durable record of background work — every
 * job has an id, type, status, attempts, start and completion times, an
 * error and a payload. Field names mirror `prisma/schema.prisma`'s `Job`.
 *
 * `workspaceId` is an addition to §21's list, documented on the schema
 * model: a scan always works for one workspace, and "this workspace's last
 * scan" (§7's connector health) and a creator's monitoring history (§8)
 * are lookups by it.
 */

export type JobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "RETRYING";

export interface JobRecord<Payload = unknown> {
  id: string;
  workspaceId: string | null;
  type: string;
  status: JobStatus;
  attempts: number;
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  payload: Payload | null;
  createdAt: Date;
}

export interface NewJob<Payload = unknown> {
  workspaceId: string | null;
  type: string;
  status: JobStatus;
  attempts: number;
  startedAt: Date | null;
  payload: Payload | null;
}

export type JobChanges<Payload = unknown> = Partial<
  Pick<JobRecord<Payload>, "status" | "attempts" | "startedAt" | "completedAt" | "error" | "payload">
>;

export interface JobRepository {
  create<Payload>(input: NewJob<Payload>): Promise<JobRecord<Payload>>;
  update<Payload>(id: string, changes: JobChanges<Payload>): Promise<JobRecord<Payload>>;
  /** Scoped by workspace, like every other lookup by id. */
  findById<Payload>(workspaceId: string, id: string): Promise<JobRecord<Payload> | null>;
  /** Newest first. */
  findRecent<Payload>(workspaceId: string, type: string, limit: number): Promise<JobRecord<Payload>[]>;
}
