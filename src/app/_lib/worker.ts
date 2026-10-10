import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { SCAN_JOB_TYPE, processNextJob, type JobHandler } from "@/modules/jobs";
import { getJobStore } from "./job-store";
import { log } from "./log";
import { AUDIO_CHECK_JOB, FINGERPRINT_TRACK_JOB, UPLOAD_MAX_AGE_MS, getUploadStore, isOwnRecognitionEnabled } from "./own-recognition";
import { runAudioCheckJob, runFingerprintTrackJob } from "./recognition-jobs";
import { runQueuedScan } from "./scan-queue";
import { runDueScans } from "./scheduled-scans";

/**
 * The background worker for our own server (`JOB_RUNNER=worker`), started
 * once per server process from `src/instrumentation.ts`. Three loops:
 *
 * - **Jobs**: take the next due job from the queue and run it; when the
 *   queue is empty, look again after a short pause.
 * - **Schedule**: every few minutes, queue the scans that are due by plan
 *   (`scheduled-scans.ts`). This replaces Vercel Cron and the cron
 *   container. Doing it in every process is safe: a workspace with a
 *   waiting or running scan isn't queued again.
 * - **Recovery**: put back jobs whose worker died mid-run (no heartbeat),
 *   and delete uploads a crashed job left behind (older than a day).
 *
 * Each job type's handler is listed in `handlers` below.
 */

const IDLE_PAUSE_MS = 2_000;
const SCHEDULE_EVERY_MS = 5 * 60_000;
const RECOVER_EVERY_MS = 60_000;
const STALE_AFTER_MS = 5 * 60_000;

const handlers: Readonly<Record<string, JobHandler>> = {
  [SCAN_JOB_TYPE]: runQueuedScan,
  // Own recognition: only when its service and upload disk are configured.
  ...(isOwnRecognitionEnabled() ? { [FINGERPRINT_TRACK_JOB]: runFingerprintTrackJob, [AUDIO_CHECK_JOB]: runAudioCheckJob } : {}),
};

const globalForWorker = globalThis as unknown as { __bekvorWorker?: { stop: () => void } };

export function startWorker(): void {
  if (globalForWorker.__bekvorWorker) return;
  const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  const queue = getJobStore().queue;
  let stopping = false;
  const timers: NodeJS.Timeout[] = [];

  const jobLoop = async () => {
    while (!stopping) {
      try {
        const step = await processNextJob({ queue, handlers, workerId });
        if (step.outcome === "idle") await pause(IDLE_PAUSE_MS);
        else if (step.outcome === "completed") log("info", "job.completed", { jobId: step.job.id, type: step.job.type });
        else log("warn", `job.${step.outcome}`, { jobId: step.job.id, type: step.job.type, error: step.error });
      } catch (error) {
        // The database is unreachable or similar: wait and try again.
        log("error", "worker.loop", { error: String(error) });
        await pause(IDLE_PAUSE_MS * 5);
      }
    }
  };

  const schedule = async () => {
    try {
      const summary = await runDueScans();
      if (summary.scanned > 0 || summary.failed > 0) log("info", "schedule.scans", { ...summary });
    } catch (error) {
      log("error", "schedule.scans", { error: String(error) });
    }
  };

  const recover = async () => {
    try {
      const now = new Date();
      const recovered = await queue.recoverStale(new Date(now.getTime() - STALE_AFTER_MS), now);
      if (recovered > 0) log("warn", "jobs.recovered", { count: recovered });
      if (isOwnRecognitionEnabled()) {
        const swept = await getUploadStore().sweep(UPLOAD_MAX_AGE_MS);
        if (swept > 0) log("info", "uploads.swept", { count: swept });
      }
    } catch (error) {
      log("error", "jobs.recover", { error: String(error) });
    }
  };

  timers.push(setInterval(schedule, SCHEDULE_EVERY_MS), setInterval(recover, RECOVER_EVERY_MS));
  timers.forEach((timer) => timer.unref());
  setTimeout(schedule, 10_000).unref();
  void recover();
  void jobLoop();

  const stop = () => {
    stopping = true;
    timers.forEach(clearInterval);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  globalForWorker.__bekvorWorker = { stop };
  log("info", "worker.started", { workerId, types: Object.keys(handlers) });
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref());
}
