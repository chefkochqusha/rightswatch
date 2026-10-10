"use server";

import { revalidatePath } from "next/cache";
import { requireCaseManager } from "@/app/_lib/authorize";
import { recordAudit } from "@/app/_lib/audit-event";
import { deleteFingerprint } from "@/app/_lib/fingerprint-store";
import { getLibraryStore } from "@/app/_lib/library-store";

/** Removes a song's fingerprint, so posts are no longer checked against it. Analyst and up. */
export async function removeReferenceAudioAction(formData: FormData): Promise<void> {
  const session = await requireCaseManager();
  const trackId = String(formData.get("trackId") ?? "");
  const track = await getLibraryStore().catalog.findById(session.workspace.id, trackId);
  if (!track) return;
  if (await deleteFingerprint(session.workspace.id, track.id)) {
    await recordAudit({
      workspaceId: session.workspace.id,
      actorId: session.user.id,
      action: "song.reference_audio_removed",
      targetType: "music_track",
      targetId: track.id,
      metadata: { title: track.title },
    });
  }
  revalidatePath(`/workspace/rights/${track.id}`);
}
