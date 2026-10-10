import { timingSafeEqual } from "node:crypto";
import { getPrisma } from "@/lib/prisma-client";
import { getJobRunnerMode } from "@/app/_lib/job-runner";
import { AUDIO_CHECK_JOB, FINGERPRINT_TRACK_JOB, getRecognizerClient, isOwnRecognitionEnabled } from "@/app/_lib/own-recognition";
import { SCAN_JOB_TYPE } from "@/modules/jobs";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — for the container health check and an uptime monitor,
 * instead of a monitoring service.
 *
 * Everyone gets only `{ ok }` with 200 or 503. With
 * `Authorization: Bearer <HEALTH_TOKEN>` the answer also says what is wrong:
 * database, recognition service, and the job queue (jobs waiting much longer
 * than they should — the worker is stuck — and jobs that failed for good
 * in the last day). Counts only, no customer data.
 */
export async function GET(request: Request): Promise<Response> {
  const checks: Record<string, unknown> = {};
  let ok = true;

  try {
    await getPrisma().$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "unreachable";
    ok = false;
  }

  if (checks.database === "ok") {
    const now = Date.now();
    const type = { in: [SCAN_JOB_TYPE, FINGERPRINT_TRACK_JOB, AUDIO_CHECK_JOB] };
    const [stuck, failed] = await Promise.all([
      getPrisma().job.count({ where: { type, status: { in: ["QUEUED", "RETRYING"] }, runAfter: { lt: new Date(now - 15 * 60_000) } } }),
      getPrisma().job.count({ where: { type, status: "FAILED", completedAt: { gt: new Date(now - 24 * 3600_000) } } }),
    ]);
    checks.jobs = { runner: getJobRunnerMode(), waitingTooLong: stuck, failedLastDay: failed };
    if (getJobRunnerMode() === "worker" && stuck > 0) ok = false;
  }

  if (isOwnRecognitionEnabled()) {
    try {
      const health = await getRecognizerClient().health();
      checks.recognition = health.ok ? "ok" : "unhealthy";
      if (!health.ok) ok = false;
    } catch {
      checks.recognition = "unreachable";
      ok = false;
    }
  }

  const headers = { "Cache-Control": "no-store" };
  const body = authorized(request) ? { ok, ...checks } : { ok };
  return Response.json(body, { status: ok ? 200 : 503, headers });
}

function authorized(request: Request): boolean {
  const token = process.env.HEALTH_TOKEN;
  if (!token) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
