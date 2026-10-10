/**
 * Where background work runs.
 *
 * - `inline` (default): in the request that asks for it, as before. The
 *   only choice on Vercel, where nothing runs between requests.
 * - `worker`: the request puts a job on the queue (the `jobs` table) and
 *   returns at once; a worker in the server process (`worker.ts`, started
 *   from `src/instrumentation.ts`) runs it, retries it when it fails, and
 *   also starts the scheduled scans. The setting for our own server.
 */
export type JobRunnerMode = "inline" | "worker";

export function getJobRunnerMode(env: NodeJS.ProcessEnv = process.env): JobRunnerMode {
  return env.JOB_RUNNER === "worker" ? "worker" : "inline";
}
