import type { NextRequest } from "next/server";
import { getJobStore } from "@/app/_lib/job-store";
import { getLibraryStore } from "@/app/_lib/library-store";
import { FINGERPRINT_TRACK_JOB, MAX_SONG_UPLOAD_BYTES, getUploadStore } from "@/app/_lib/own-recognition";
import type { FingerprintTrackPayload } from "@/app/_lib/recognition-jobs";
import { receiveUpload } from "@/app/_lib/upload-request";

export const dynamic = "force-dynamic";

/**
 * POST /api/uploads/track-audio/{trackId} — the body is a recording of one
 * of the workspace's catalogue songs. It's stored briefly and a job makes
 * the song's fingerprint from it (`recognition-jobs.ts`); the recording is
 * then deleted. Answers 202 with the job id.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/uploads/track-audio/[trackId]">): Promise<Response> {
  const { trackId } = await ctx.params;
  const received = await receiveUpload(request, MAX_SONG_UPLOAD_BYTES);
  if (!received.ok) return received.response;
  const { session, upload, fileName } = received;

  const track = await getLibraryStore().catalog.findById(session.workspace.id, trackId);
  if (!track?.inCatalogue) {
    await getUploadStore().delete(upload.key);
    return Response.json({ error: "Add the song to your catalogue first." }, { status: 404 });
  }

  const job = await getJobStore().queue.enqueue<FingerprintTrackPayload>({
    workspaceId: session.workspace.id,
    type: FINGERPRINT_TRACK_JOB,
    payload: { trackId: track.id, uploadKey: upload.key, fileName, sha256: upload.sha256, requestedById: session.user.id },
  });
  return Response.json({ jobId: job.id }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
