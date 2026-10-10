import type { JobQueue, JobRecord } from "./types";

/**
 * One step of a background worker: claim the next due job, run its
 * handler, record the outcome. Pure apart from the queue and the handlers
 * it is given, so the retry rules are tested without a database.
 *
 * - A handler that throws `PermanentJobError` fails the job for good: the
 *   input is wrong, and trying again would fail the same way.
 * - Any other error is retried while the job has tries left, with a
 *   growing pause (1, 5, 25 minutes), then fails for good.
 * - While a handler runs, a heartbeat keeps the job marked as alive, so
 *   `recoverStale` only takes back jobs whose worker really died.
 */

export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export type JobHandler = (job: JobRecord) => Promise<unknown>;

export type JobStepResult =
  | { outcome: "idle" }
  | { outcome: "completed"; job: JobRecord }
  | { outcome: "retrying"; job: JobRecord; error: string; retryAt: Date }
  | { outcome: "failed"; job: JobRecord; error: string };

export interface JobStepOptions {
  queue: JobQueue;
  handlers: Readonly<Record<string, JobHandler>>;
  workerId: string;
  clock?: () => Date;
  heartbeatMs?: number;
}

export const RETRY_BASE_MS = 60_000;

/** The pause before the next try, after `attempts` tries: 1, 5, 25 minutes … */
export function retryDelayMs(attempts: number): number {
  return RETRY_BASE_MS * 5 ** Math.max(0, attempts - 1);
}

export async function processNextJob(options: JobStepOptions): Promise<JobStepResult> {
  const clock = options.clock ?? (() => new Date());
  const job = await options.queue.claim(options.workerId, Object.keys(options.handlers), clock());
  if (!job) return { outcome: "idle" };

  const handler = options.handlers[job.type];
  const heartbeat = setInterval(() => {
    options.queue.heartbeat(job.id, options.workerId, clock()).catch(() => undefined);
  }, options.heartbeatMs ?? 30_000);
  heartbeat.unref?.();

  try {
    const payload = await handler(job);
    await options.queue.complete(job.id, payload === undefined ? undefined : payload, options.workerId);
    return { outcome: "completed", job };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const permanent = error instanceof PermanentJobError;
    if (!permanent && job.attempts < job.maxAttempts) {
      const retryAt = new Date(clock().getTime() + retryDelayMs(job.attempts));
      await options.queue.fail(job.id, message, retryAt, options.workerId);
      return { outcome: "retrying", job, error: message, retryAt };
    }
    await options.queue.fail(job.id, message, null, options.workerId);
    return { outcome: "failed", job, error: message };
  } finally {
    clearInterval(heartbeat);
  }
}
