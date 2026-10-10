"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCaseManager } from "@/app/_lib/authorize";
import { recordAudit } from "@/app/_lib/audit-event";
import { getCreatorStore } from "@/app/_lib/creator-store";
import { DEMO_WORKSPACE_SLUG } from "@/app/_lib/demo-constants";
import { getScanResultStore } from "@/app/_lib/scan-result-store";
import { manualPostContent, parseManualPost, type ManualPostField } from "@/modules/connectors/manual-post";

export interface AddPostState {
  formError?: string;
  fieldErrors?: Partial<Record<ManualPostField | "creatorId", string>>;
  existing?: string;
}

/**
 * Adds a commercial post by hand (analyst and up): stored like a scan
 * result with no song yet, then the post's page opens, where its song can
 * be identified — by uploading its audio (own recognition) or by choosing
 * it. A post that's already there isn't added twice.
 */
export async function addPostAction(_prev: AddPostState, formData: FormData): Promise<AddPostState> {
  const session = await requireCaseManager();
  if (session.workspace.slug === DEMO_WORKSPACE_SLUG) return { formError: "The demo workspace's posts are fixed. Sign up to add your own." };
  const workspaceId = session.workspace.id;
  const field = (name: string) => String(formData.get(name) ?? "");

  const creator = await getCreatorStore().creators.findById(workspaceId, field("creatorId"));
  const parsed = parseManualPost({ url: field("url"), publishedOn: field("publishedOn"), brands: field("brands"), label: field("label"), territory: field("territory") });
  const fieldErrors: AddPostState["fieldErrors"] = parsed.ok ? {} : { ...parsed.fieldErrors };
  if (!creator || creator.removedAt) fieldErrors.creatorId = "Choose a creator from your watchlist.";
  else if (parsed.ok && parsed.post.handle !== creator.handle.toLowerCase()) {
    fieldErrors.url = `This link is a post by @${parsed.post.handle}, not @${creator.handle}.`;
  }
  if (!parsed.ok || !creator || Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const results = getScanResultStore().results;
  if (await results.findByContentId(workspaceId, parsed.post.videoId)) {
    return { formError: "This post is already in your workspace.", existing: parsed.post.videoId };
  }
  await results.saveScan({
    workspaceId,
    musicProviderName: "manual-entry",
    items: [
      {
        kind: "NO_MUSIC_MATCH",
        content: manualPostContent(parsed.post, creator),
        creatorId: creator.id,
        creatorExternalId: creator.externalId,
        creatorUsername: creator.handle,
      },
    ],
  });
  await recordAudit({
    workspaceId,
    actorId: session.user.id,
    action: "post.added",
    targetType: "content",
    targetId: parsed.post.videoId,
    metadata: { handle: creator.handle },
  });
  revalidatePath("/workspace", "layout");
  redirect(`/workspace/items/${parsed.post.videoId}?added=1`);
}
