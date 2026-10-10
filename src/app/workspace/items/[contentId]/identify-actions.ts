"use server";

import { revalidatePath } from "next/cache";
import { requireCaseManager } from "@/app/_lib/authorize";
import { identifyPostSong } from "@/app/_lib/identify-post";
import { rejectPostSong } from "@/app/_lib/reject-song";
import { DEMO_WORKSPACE_SLUG } from "@/app/_lib/demo-constants";

export interface IdentifyFormState {
  error?: string;
}

/** "Identify the song" on a post no provider could identify. Analyst and up. */
export async function identifySongAction(_prev: IdentifyFormState, formData: FormData): Promise<IdentifyFormState> {
  const session = await requireCaseManager();
  const contentId = String(formData.get("contentId") ?? "");
  const trackId = String(formData.get("trackId") ?? "");
  if (!trackId) return { error: "Choose a song first." };

  const result = await identifyPostSong({
    workspaceId: session.workspace.id,
    actorUserId: session.user.id,
    externalContentId: contentId,
    trackId,
  });
  if (!result.ok) {
    return {
      error:
        result.error === "NOT_IN_CATALOGUE"
          ? "That song isn't in your library. Add it in the Rights Library first."
          : result.error === "ALREADY_IDENTIFIED"
            ? "This post already has a song."
            : "That post couldn't be found.",
    };
  }
  // The post is now assessed, and may have opened a case and notifications.
  revalidatePath("/workspace", "layout");
  return {};
}

export interface RejectFormState {
  error?: string;
}

/** "Wrong song": withdraws the post's song identification. Analyst and up; not in the public demo. */
export async function rejectSongAction(_prev: RejectFormState, formData: FormData): Promise<RejectFormState> {
  const session = await requireCaseManager();
  if (session.workspace.slug === DEMO_WORKSPACE_SLUG) return { error: "The demo workspace's posts are fixed." };
  const contentId = String(formData.get("contentId") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const result = await rejectPostSong({ workspaceId: session.workspace.id, actorUserId: session.user.id, externalContentId: contentId, note });
  if (!result.ok) return { error: "This post has no song to withdraw." };
  revalidatePath("/workspace", "layout");
  return {};
}
