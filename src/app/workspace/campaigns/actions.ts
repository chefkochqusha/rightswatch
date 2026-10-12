"use server";

import { revalidatePath } from "next/cache";
import { requireCaseManager } from "@/app/_lib/authorize";
import { getLibraryStore } from "@/app/_lib/library-store";
import { recordAudit } from "@/app/_lib/audit-event";
import { reassessSong } from "@/app/_lib/reassess";
import { getCreatorStore } from "@/app/_lib/creator-store";
import { CAMPAIGN_NAME_MAX, createCampaign, deleteCampaign, renameCampaign, setCreatorOnCampaign, type CampaignError } from "@/modules/campaigns";

/**
 * Campaign actions (Brief §2: "assign creators to campaigns/projects").
 * Gated like the Rights Library (`requireCaseManager`: analysts and up),
 * scoped to the caller's workspace, audit-logged. Changing who is on a
 * campaign re-assesses the songs whose rights records are limited to
 * campaigns, so no verdict rests on the old membership.
 */

export interface CampaignActionState {
  error?: string;
  done?: string;
}

const ERRORS: Record<CampaignError, string> = {
  NAME_REQUIRED: "Give the campaign a name.",
  NAME_TOO_LONG: `Keep the name under ${CAMPAIGN_NAME_MAX} characters.`,
  NAME_TAKEN: "There's already a campaign with that name.",
  NOT_FOUND: "That campaign or creator isn't in this workspace any more.",
  IN_USE: "Rights records are limited to this campaign.",
};

function deps() {
  const library = getLibraryStore();
  return { campaigns: library.campaigns, rightsRecords: (workspaceId: string) => library.rights.findForWorkspace(workspaceId) };
}

function message(error: CampaignError, detail?: number): string {
  if (error === "IN_USE" && detail) {
    return `${detail === 1 ? "A rights record is" : `${detail} rights records are`} limited to this campaign. Change ${detail === 1 ? "it" : "them"} in the Rights Library first, so no licence suddenly covers every campaign.`;
  }
  return ERRORS[error];
}

export async function createCampaignAction(_previous: CampaignActionState, formData: FormData): Promise<CampaignActionState> {
  const session = await requireCaseManager();
  const result = await createCampaign({ workspaceId: session.workspace.id, name: String(formData.get("name") ?? "") }, deps());
  if (!result.ok) return { error: message(result.error) };
  await recordAudit({ workspaceId: session.workspace.id, actorId: session.user.id, action: "campaign.created", targetType: "campaign", targetId: result.campaign.id, metadata: { name: result.campaign.name } });
  revalidatePath("/workspace/campaigns");
  return { done: `Created ${result.campaign.name}.` };
}

export async function renameCampaignAction(_previous: CampaignActionState, formData: FormData): Promise<CampaignActionState> {
  const session = await requireCaseManager();
  const campaignId = String(formData.get("campaignId") ?? "");
  const result = await renameCampaign({ workspaceId: session.workspace.id, campaignId, name: String(formData.get("name") ?? "") }, deps());
  if (!result.ok) return { error: message(result.error) };
  if (result.previousName !== result.name) {
    await recordAudit({ workspaceId: session.workspace.id, actorId: session.user.id, action: "campaign.renamed", targetType: "campaign", targetId: campaignId, metadata: { from: result.previousName, name: result.name } });
  }
  revalidatePath("/workspace", "layout");
  return { done: "Renamed." };
}

export async function deleteCampaignAction(_previous: CampaignActionState, formData: FormData): Promise<CampaignActionState> {
  const session = await requireCaseManager();
  const campaignId = String(formData.get("campaignId") ?? "");
  const result = await deleteCampaign({ workspaceId: session.workspace.id, campaignId }, deps());
  if (!result.ok) return { error: message(result.error, result.detail) };
  await recordAudit({ workspaceId: session.workspace.id, actorId: session.user.id, action: "campaign.deleted", targetType: "campaign", targetId: campaignId, metadata: { name: result.name } });
  revalidatePath("/workspace", "layout");
  return { done: "Deleted." };
}

export async function setCreatorOnCampaignAction(_previous: CampaignActionState, formData: FormData): Promise<CampaignActionState> {
  const session = await requireCaseManager();
  const workspaceId = session.workspace.id;
  const campaignId = String(formData.get("campaignId") ?? "");
  const creatorId = String(formData.get("creatorId") ?? "");
  const on = formData.get("on") === "true";
  if (!creatorId) return { error: "Choose a creator." };
  const result = await setCreatorOnCampaign({ workspaceId, campaignId, creatorId, on }, deps());
  if (!result.ok) return { error: message(result.error) };
  if (result.changed) {
    const creator = await getCreatorStore().creators.findById(workspaceId, creatorId);
    await recordAudit({
      workspaceId,
      actorId: session.user.id,
      action: on ? "campaign.creator_added" : "campaign.creator_removed",
      targetType: "campaign",
      targetId: campaignId,
      metadata: { name: result.name, creatorId, handle: creator?.handle ?? null },
    });
    for (const trackId of result.reassess) await reassessSong(workspaceId, trackId, session.user.id);
  }
  revalidatePath("/workspace", "layout");
  return { done: on ? "Added." : "Taken off." };
}
