/**
 * Runs once when a server process starts (Next.js `instrumentation`).
 * With `JOB_RUNNER=worker` (our own server) it starts the background worker
 * in this process; on Vercel, where nothing runs between requests, it does
 * nothing and background work runs inline (`app/_lib/job-runner.ts`).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.JOB_RUNNER !== "worker") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startWorker } = await import("./app/_lib/worker");
  startWorker();
}
