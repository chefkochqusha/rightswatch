import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma-client";
import { getJobStore } from "@/app/_lib/job-store";
import { AUDIO_CHECK_JOB, MAX_POST_UPLOAD_BYTES, getUploadStore } from "@/app/_lib/own-recognition";
import type { AudioCheckPayload } from "@/app/_lib/recognition-jobs";
import { receiveUpload } from "@/app/_lib/upload-request";

export const dynamic = "force-dynamic";

/**
 * POST /api/uploads/post-audio/{contentId} — the body is a post's video or
 * sound, as the workspace saved it. A job checks it against the workspace's
 * fingerprinted songs (`recognition-jobs.ts`) and the file is then deleted.
 * `contentId` is the post's platform id, as in `/workspace/items/{contentId}`.
 * Answers 202 with the check's id.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/uploads/post-audio/[contentId]">): Promise<Response> {
  const { contentId } = await ctx.params;
  const received = await receiveUpload(request, MAX_POST_UPLOAD_BYTES);
  if (!received.ok) return received.response;
  const { session, upload, fileName } = received;
  const prisma = getPrisma();

  const content = await prisma.content.findFirst({
    where: { externalContentId: contentId, creator: { workspaceId: session.workspace.id } },
    select: { id: true },
  });
  if (!content) {
    await getUploadStore().delete(upload.key);
    return Response.json({ error: "No such post in your workspace." }, { status: 404 });
  }

  const check = await prisma.audioCheck.create({
    data: { workspaceId: session.workspace.id, contentId: content.id, fileName, requestedById: session.user.id },
  });
  const job = await getJobStore().queue.enqueue<AudioCheckPayload>({
    workspaceId: session.workspace.id,
    type: AUDIO_CHECK_JOB,
    payload: { audioCheckId: check.id, uploadKey: upload.key },
  });
  await prisma.audioCheck.update({ where: { id: check.id }, data: { jobId: job.id } });
  return Response.json({ audioCheckId: check.id }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
