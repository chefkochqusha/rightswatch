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
  /** Queue: not picked up before this time. */
  runAfter: Date;
  /** Queue: tries before the job counts as failed for good. */
  maxAttempts: number;
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

/** A job to put on the queue (`JobQueue.enqueue`). */
export interface QueuedJobInput<Payload = unknown> {
  workspaceId: string | null;
  type: string;
  payload: Payload | null;
  /** Default: now. */
  runAfter?: Date;
  /** Default: 3. */
  maxAttempts?: number;
}

/**
 * The job queue, kept in the `jobs` table (no Redis). A job goes
 * QUEUED → RUNNING → COMPLETED, or back to RETRYING (with a later
 * `runAfter`) when it fails and has tries left, or FAILED when it hasn't.
 * Several workers can claim at once; each job goes to exactly one.
 */
export interface JobQueue {
  enqueue<Payload>(input: QueuedJobInput<Payload>): Promise<JobRecord<Payload>>;
  /** Takes the job that has waited longest among the due QUEUED/RETRYING
   *  jobs of these types, marks it RUNNING (attempts + 1) under this
   *  worker's name, or returns null when there is none. */
  claim(workerId: string, types: readonly string[], now: Date): Promise<JobRecord | null>;
  /** The running worker is still alive; keeps the job from being taken back. */
  heartbeat(id: string, workerId: string, now: Date): Promise<void>;
  /** With `workerId`: only if that worker still holds the job (returns false
   *  if it was taken back meanwhile, so the outcome isn't written twice). */
  complete<Payload>(id: string, payload?: Payload, workerId?: string): Promise<boolean>;
  /** `retryAt` null: failed for good. Otherwise queued again for then. */
  fail(id: string, error: string, retryAt: Date | null, workerId?: string): Promise<boolean>;
  /** Jobs RUNNING with no heartbeat since `staleBefore` (their worker died)
   *  go back to the queue, or fail when they have no tries left. Jobs run
   *  inline (no worker, so no heartbeat) that started before
   *  `inlineStaleBefore` fail: their request was cut off. */
  recoverStale(staleBefore: Date, now: Date, inlineStaleBefore?: Date): Promise<number>;
  /** A job of this type is waiting or running for the workspace. An inline
   *  run older than `INLINE_STALE_MS` doesn't count: its request died. */
  findPending<Payload>(workspaceId: string, type: string): Promise<JobRecord<Payload> | null>;
}

/** An inline job (run inside a request) still RUNNING after this was cut off
 *  (Vercel stops a function after 300 s). */
export const INLINE_STALE_MS = 30 * 60_000;
