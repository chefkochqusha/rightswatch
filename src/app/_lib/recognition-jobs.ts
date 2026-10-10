import { getPrisma } from "@/lib/prisma-client";
import { PermanentJobError, type JobRecord } from "@/modules/jobs";
import { RecognitionServiceError, catalogueVersion, decideRecognition, type RecognitionDecision } from "@/modules/recognition";
import { toRightsRecordInput } from "@/modules/rights";
import { recordAudit } from "./audit-event";
import { openCasesForFlaggedItems } from "./case-automation";
import { indexData, indexTracks, saveFingerprint } from "./fingerprint-store";
import { getLibraryStore } from "./library-store";
import { getRecognitionThresholds, getRecognizerClient, getUploadStore } from "./own-recognition";
import { makeAssessor } from "./reassess";
import { getScanResultStore } from "./scan-result-store";
import { log } from "./log";

/**
 * The worker's two recognition jobs (`worker.ts`):
 *
 * - **fingerprint_track**: an uploaded recording of a catalogue song →
 *   its fingerprint in Postgres. The recording is deleted afterwards.
 * - **audio_check**: an uploaded post video or sound → which catalogue
 *   song it uses. The result is kept on the post as a suggestion a person
 *   confirms with one click (the song is preselected). Only with
 *   `RECOGNITION_AUTO_IDENTIFY=true` does a sure match identify the song by
 *   itself (provider "bekvor"), and the post is then assessed and, if not
 *   cleared, gets a case like any scan result. Off by default: the
 *   calibration on synthetic songs found one look-alike song judged a sure
 *   match (`services/recognizer/README.md`), and an automatic identification
 *   can't be undone yet. The upload is deleted afterwards.
 *
 * Unreadable files fail at once; an unreachable recognition service is
 * retried by the queue (1, 5, 25 minutes) and the upload is kept until
 * the last try (or the 24-hour sweep).
 */

export interface FingerprintTrackPayload {
  trackId: string;
  uploadKey: string;
  fileName: string | null;
  sha256: string;
  requestedById: string | null;
  result?: { durationSec: number; hashCount: number };
}

export interface AudioCheckPayload {
  audioCheckId: string;
  uploadKey: string;
}

export const RECOGNITION_PROVIDER = "bekvor";

export async function runFingerprintTrackJob(job: JobRecord): Promise<FingerprintTrackPayload> {
  const payload = job.payload as FingerprintTrackPayload | null;
  if (!job.workspaceId || !payload?.trackId || !payload.uploadKey) throw new PermanentJobError("Incomplete fingerprint job.");
  const workspaceId = job.workspaceId;
  const store = getUploadStore();
  try {
    const track = await getLibraryStore().catalog.findById(workspaceId, payload.trackId);
    if (!track) throw new PermanentJobError("The song no longer exists.");
    const audio = await store.read(payload.uploadKey).catch(() => {
      throw new PermanentJobError("The uploaded file is gone (it was kept for 24 hours). Please upload it again.");
    });
    const fp = await getRecognizerClient().fingerprint(audio).catch(asPermanentIfUnreadable);
    await saveFingerprint({
      workspaceId,
      trackId: track.id,
      algorithm: fp.algorithm,
      data: Buffer.from(fp.fingerprint, "base64"),
      durationSec: fp.durationSec,
      hashCount: fp.hashCount,
      sourceFileName: payload.fileName,
      sourceSha256: payload.sha256,
      createdById: payload.requestedById,
    });
    // The fingerprint is stored: nothing after this may fail the job (a retry
    // would find the recording gone and report a failure that didn't happen).
    await store.delete(payload.uploadKey).catch((e) => log("warn", "upload.delete", { error: String(e) }));
    await recordAudit({
      workspaceId,
      actorId: payload.requestedById,
      action: "song.reference_audio_added",
      targetType: "music_track",
      targetId: track.id,
      metadata: { title: track.title, durationSec: fp.durationSec },
    });
    return { ...payload, result: { durationSec: fp.durationSec, hashCount: fp.hashCount } };
  } catch (error) {
    if (error instanceof PermanentJobError || job.attempts >= job.maxAttempts) await store.delete(payload.uploadKey);
    throw error;
  }
}

export async function runAudioCheckJob(job: JobRecord): Promise<AudioCheckPayload> {
  const payload = job.payload as AudioCheckPayload | null;
  if (!job.workspaceId || !payload?.audioCheckId) throw new PermanentJobError("Incomplete audio check job.");
  const workspaceId = job.workspaceId;
  const prisma = getPrisma();
  const store = getUploadStore();
  const check = await prisma.audioCheck.findFirst({
    where: { id: payload.audioCheckId, workspaceId },
    include: { content: true },
  });
  if (!check) {
    await store.delete(payload.uploadKey);
    throw new PermanentJobError("The audio check no longer exists.");
  }
  if (check.status === "DONE") return payload; // a repeat of a finished check
  await prisma.audioCheck.update({ where: { id: check.id }, data: { status: "RUNNING", error: null } });

  try {
    const tracks = await indexTracks(workspaceId);
    if (tracks.length === 0) {
      await finish(check.id, {
        outcome: "NO_MATCH",
        trackId: null,
        confidence: 0,
        reason: "None of your catalogue songs has reference audio yet, so there was nothing to compare with.",
      }, null);
      await store.delete(payload.uploadKey);
      return payload;
    }

    const audio = await store.read(payload.uploadKey).catch(() => {
      throw new PermanentJobError("The uploaded file is gone (it was kept for 24 hours). Please upload it again.");
    });
    const client = getRecognizerClient();
    const version = catalogueVersion(tracks);
    let result = await client.match(workspaceId, version, audio).catch(asPermanentIfUnreadable);
    if (!result) {
      await client.loadIndex(workspaceId, version, await indexData(workspaceId, tracks.map((t) => t.trackId)));
      result = await client.match(workspaceId, version, audio).catch(asPermanentIfUnreadable);
      if (!result) throw new Error("The recognition service didn't keep the index.");
    }
    const decision = decideRecognition(result, getRecognitionThresholds());
    await finish(check.id, decision, result);
    // The result is stored: what follows may not turn it into a failure.
    try {
      await store.delete(payload.uploadKey);
      await recordAudit({
        workspaceId,
        actorId: check.requestedById,
        action: "post.audio_checked",
        targetType: "content",
        targetId: check.content.externalContentId,
        metadata: { outcome: decision.outcome, trackId: decision.trackId, confidence: decision.confidence },
      });
      if (decision.outcome === "MATCH" && decision.trackId && autoIdentifyEnabled()) {
        await identifyRecognisedSong(workspaceId, check.content.externalContentId, decision);
      }
    } catch (error) {
      log("error", "audio_check.after_result", { audioCheckId: check.id, error: String(error) });
    }
    return payload;
  } catch (error) {
    const final = error instanceof PermanentJobError || job.attempts >= job.maxAttempts;
    // Never over a stored result.
    await prisma.audioCheck.updateMany({
      where: { id: check.id, status: { not: "DONE" } },
      data: final
        ? { status: "FAILED", error: error instanceof Error ? error.message : String(error), completedAt: new Date() }
        : { status: "QUEUED", error: "The check will be tried again in a few minutes." },
    });
    if (final) await store.delete(payload.uploadKey);
    throw error;
  }
}

/**
 * A sure match: the post's song is identified (unless the post already has
 * one — an earlier identification, by a person or a scan, is never
 * replaced), assessed against the song's rights records, and given a case
 * if it isn't cleared.
 */
async function identifyRecognisedSong(workspaceId: string, externalContentId: string, decision: RecognitionDecision): Promise<void> {
  const results = getScanResultStore().results;
  const existing = await results.findByContentId(workspaceId, externalContentId);
  if (!existing || existing.kind === "ASSESSED" || existing.kind === "OTHER_MUSIC") return;
  const library = getLibraryStore();
  const track = await library.catalog.findById(workspaceId, decision.trackId!);
  if (!track?.inCatalogue) return;
  const rights = (await library.rights.findForTrack(workspaceId, track.id)).map(toRightsRecordInput);
  const item = await results.identifyPost({
    workspaceId,
    externalContentId,
    track: { id: track.id, title: track.title, artist: track.artist, isrc: track.isrc },
    assess: makeAssessor(workspaceId, rights),
    source: { provider: RECOGNITION_PROVIDER, confidence: decision.confidence, manual: false },
  });
  if (!item) return;
  await recordAudit({
    workspaceId,
    actorId: null,
    action: "post.song_recognised",
    targetType: "content",
    targetId: externalContentId,
    metadata: { trackId: track.id, title: track.title, confidence: decision.confidence },
  });
  await openCasesForFlaggedItems(workspaceId, null, [item]);
}

async function finish(checkId: string, decision: RecognitionDecision, result: { durationSec: number } | null): Promise<void> {
  await getPrisma().audioCheck.update({
    where: { id: checkId },
    data: {
      status: "DONE",
      outcome: decision.outcome,
      musicTrackId: decision.trackId,
      confidence: decision.confidence,
      durationSec: result?.durationSec ?? null,
      details: JSON.parse(JSON.stringify({ reason: decision.reason, result })),
      error: null,
      completedAt: new Date(),
    },
  });
}

export function autoIdentifyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.RECOGNITION_AUTO_IDENTIFY === "true";
}

/**
 * Brings audio checks in line with their jobs, for the cases a job's own
 * code can't handle: its process died (the queue took the job back or
 * failed it), or the check was saved but its job never queued. Without
 * this a check could show "Checking…" forever. Run by the worker's
 * recovery loop.
 */
export async function reconcileAudioChecks(now: Date = new Date()): Promise<number> {
  const prisma = getPrisma();
  const open = await prisma.audioCheck.findMany({
    where: { status: { in: ["QUEUED", "RUNNING"] }, createdAt: { lt: new Date(now.getTime() - 2 * 60_000) } },
    select: { id: true, status: true, jobId: true, createdAt: true },
    take: 500,
  });
  if (open.length === 0) return 0;
  const jobs = new Map(
    (await prisma.job.findMany({ where: { id: { in: open.flatMap((c) => (c.jobId ? [c.jobId] : [])) } }, select: { id: true, status: true, error: true } })).map((j) => [j.id, j]),
  );
  let changed = 0;
  for (const check of open) {
    const job = check.jobId ? jobs.get(check.jobId) : undefined;
    let data: { status: "FAILED" | "QUEUED"; error: string; completedAt?: Date } | null = null;
    if (!job) {
      if (now.getTime() - check.createdAt.getTime() > 10 * 60_000) data = { status: "FAILED", error: "The check couldn't be started. Please upload the file again.", completedAt: now };
    } else if (job.status === "FAILED" || job.status === "COMPLETED") {
      data = { status: "FAILED", error: job.error ?? "The check ended without a result. Please upload the file again.", completedAt: now };
    } else if ((job.status === "RETRYING" || job.status === "QUEUED") && check.status === "RUNNING") {
      data = { status: "QUEUED", error: "The check will be tried again in a few minutes." };
    }
    if (data) {
      const { count } = await prisma.audioCheck.updateMany({ where: { id: check.id, status: { not: "DONE" } }, data });
      changed += count;
    }
  }
  return changed;
}

function asPermanentIfUnreadable(error: unknown): never {
  if (error instanceof RecognitionServiceError && error.unreadableAudio) {
    throw new PermanentJobError(`${error.message} Please upload an audio or video file with sound.`);
  }
  throw error;
}
