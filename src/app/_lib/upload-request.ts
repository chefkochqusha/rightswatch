import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma-client";
import { MEDIA_FORMAT_LABEL, sniffMediaFormat, type MediaFormat } from "@/modules/recognition";
import { UploadTooLargeError, type StoredUpload } from "@/modules/storage";
import { canManageCases } from "./authorize";
import { getCurrentSession, type CurrentSession } from "./current-user";
import { DEMO_WORKSPACE_SLUG } from "./demo-constants";
import { AUDIO_CHECK_JOB, FINGERPRINT_TRACK_JOB, MAX_PENDING_UPLOADS, getUploadStore, isOwnRecognitionEnabled } from "./own-recognition";
import { spendRequest } from "./request-limit";
import { siteOrigin } from "./site-origin";

/**
 * The checks every upload goes through, in order, before a byte is kept:
 *
 * 1. Own recognition is set up on this server (otherwise 404).
 * 2. A real session, an owner/admin/analyst, not the public demo.
 * 3. Same-site: the `Origin` is this site, and the request carries a custom
 *    header a plain HTML form can't send (blocks cross-site uploads).
 * 4. Budget: 60 uploads an hour per person, at most a few waiting per workspace.
 * 5. Size: the declared size, then the bytes actually received.
 * 6. Type: the first bytes must be a known audio or video container.
 *
 * The file goes to the upload disk under a random name; the caller queues
 * the job that uses it, and that job deletes it.
 */

export const UPLOAD_HEADER = "x-bekvor-upload";

export type UploadOutcome =
  | { ok: true; session: CurrentSession; upload: StoredUpload; format: MediaFormat; fileName: string | null }
  | { ok: false; response: Response };

export async function receiveUpload(request: NextRequest, maxBytes: number): Promise<UploadOutcome> {
  const refuse = (status: number, error: string, headers: Record<string, string> = {}) => ({
    ok: false as const,
    response: Response.json({ error }, { status, headers: { "Cache-Control": "no-store", ...headers } }),
  });

  if (!isOwnRecognitionEnabled()) return refuse(404, "Not available on this server.");

  const session = await getCurrentSession();
  if (!session) return refuse(401, "Please log in again.");
  if (!canManageCases(session.role)) return refuse(403, "Only owners, admins and analysts can upload.");
  if (session.workspace.slug === DEMO_WORKSPACE_SLUG) return refuse(403, "The demo workspace doesn't take uploads.");

  const origin = request.headers.get("origin");
  if (!origin || ![siteOrigin(), request.nextUrl.origin].includes(origin) || request.headers.get(UPLOAD_HEADER) !== "1") {
    return refuse(403, "Uploads only from Bekvor's own pages.");
  }

  const wait = spendRequest("upload", session.user.id, { max: 60, windowMs: 3600_000 });
  if (wait !== null) return refuse(429, "Too many uploads. Please wait a little.", { "Retry-After": String(wait) });

  const pending = await getPrisma().job.count({
    where: { workspaceId: session.workspace.id, type: { in: [FINGERPRINT_TRACK_JOB, AUDIO_CHECK_JOB] }, status: { in: ["QUEUED", "RETRYING", "RUNNING"] } },
  });
  if (pending >= MAX_PENDING_UPLOADS) return refuse(429, "Several uploads are still being processed. Please wait until they're done.");

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return refuse(413, `The file is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  if (!request.body) return refuse(400, "No file was sent.");

  const store = getUploadStore();
  let upload: StoredUpload;
  try {
    upload = await store.save(request.body, maxBytes);
  } catch (error) {
    if (error instanceof UploadTooLargeError) return refuse(413, error.message);
    throw error;
  }
  if (upload.size === 0) {
    await store.delete(upload.key);
    return refuse(400, "The file is empty.");
  }
  const format = sniffMediaFormat(upload.head);
  if (!format) {
    await store.delete(upload.key);
    return refuse(415, `That isn't an audio or video file Bekvor can read (${MEDIA_FORMAT_LABEL}).`);
  }
  return { ok: true, session, upload, format, fileName: cleanFileName(request.headers.get("x-file-name")) };
}

/** The uploader's file name, only for display ("from master.wav"): decoded,
 *  path parts and control characters removed, kept short. */
export function cleanFileName(raw: string | null): string | null {
  if (!raw) return null;
  let name: string;
  try {
    name = decodeURIComponent(raw);
  } catch {
    return null;
  }
  name = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return name ? name.slice(0, 120) : null;
}
