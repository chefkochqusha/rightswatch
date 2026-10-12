import type { CampaignDirectory, WorkspaceCampaign } from "./types";

/**
 * Managing a workspace's campaigns (Brief §2: "assign creators to
 * campaigns/projects"). A rights record can be limited to campaigns, and a
 * post counts as part of a campaign when its creator is on it — so these
 * rules protect what the verdicts rest on:
 *
 * - A campaign a rights record is limited to can't be deleted. Deleting it
 *   would leave that record with no campaign, which means "every campaign":
 *   a licence would silently grow.
 * - Putting a creator on a campaign or taking them off can change verdicts;
 *   the caller re-assesses the songs whose records are limited to campaigns
 *   (`songsToReassess`).
 */

export const CAMPAIGN_NAME_MAX = 80;

export type CampaignError = "NAME_REQUIRED" | "NAME_TOO_LONG" | "NAME_TAKEN" | "NOT_FOUND" | "IN_USE";

export interface CampaignDependencies {
  campaigns: CampaignDirectory;
  /** The workspace's rights records, as far as campaigns matter. */
  rightsRecords: (workspaceId: string) => Promise<{ trackId: string; campaignIds: string[] }[]>;
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: CampaignError; detail?: number };

function cleanName(raw: string): { ok: true; name: string } | { ok: false; error: CampaignError } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "NAME_REQUIRED" };
  if (name.length > CAMPAIGN_NAME_MAX) return { ok: false, error: "NAME_TOO_LONG" };
  return { ok: true, name };
}

function sameName(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

async function find(deps: CampaignDependencies, workspaceId: string, campaignId: string): Promise<WorkspaceCampaign | null> {
  return (await deps.campaigns.findForWorkspace(workspaceId)).find((c) => c.id === campaignId) ?? null;
}

export async function createCampaign(
  input: { workspaceId: string; name: string },
  deps: CampaignDependencies,
): Promise<Result<{ campaign: WorkspaceCampaign }>> {
  const cleaned = cleanName(input.name);
  if (!cleaned.ok) return cleaned;
  const existing = await deps.campaigns.findForWorkspace(input.workspaceId);
  if (existing.some((c) => sameName(c.name, cleaned.name))) return { ok: false, error: "NAME_TAKEN" };
  return { ok: true, campaign: await deps.campaigns.ensure(input.workspaceId, cleaned.name) };
}

export async function renameCampaign(
  input: { workspaceId: string; campaignId: string; name: string },
  deps: CampaignDependencies,
): Promise<Result<{ previousName: string; name: string }>> {
  const cleaned = cleanName(input.name);
  if (!cleaned.ok) return cleaned;
  const all = await deps.campaigns.findForWorkspace(input.workspaceId);
  const campaign = all.find((c) => c.id === input.campaignId);
  if (!campaign) return { ok: false, error: "NOT_FOUND" };
  if (all.some((c) => c.id !== campaign.id && sameName(c.name, cleaned.name))) return { ok: false, error: "NAME_TAKEN" };
  await deps.campaigns.rename(input.workspaceId, campaign.id, cleaned.name);
  return { ok: true, previousName: campaign.name, name: cleaned.name };
}

/** Refused with `IN_USE` (and the number of records in `detail`) while a rights record is limited to it. */
export async function deleteCampaign(
  input: { workspaceId: string; campaignId: string },
  deps: CampaignDependencies,
): Promise<Result<{ name: string }>> {
  const campaign = await find(deps, input.workspaceId, input.campaignId);
  if (!campaign) return { ok: false, error: "NOT_FOUND" };
  const using = (await deps.rightsRecords(input.workspaceId)).filter((r) => r.campaignIds.includes(campaign.id)).length;
  if (using > 0) return { ok: false, error: "IN_USE", detail: using };
  await deps.campaigns.delete(input.workspaceId, campaign.id);
  return { ok: true, name: campaign.name };
}

/** Songs whose verdicts can depend on campaign membership: those with a record limited to campaigns. */
export async function songsToReassess(workspaceId: string, deps: CampaignDependencies): Promise<string[]> {
  const records = await deps.rightsRecords(workspaceId);
  return [...new Set(records.filter((r) => r.campaignIds.length > 0).map((r) => r.trackId))];
}

export async function setCreatorOnCampaign(
  input: { workspaceId: string; campaignId: string; creatorId: string; on: boolean },
  deps: CampaignDependencies,
): Promise<Result<{ name: string; changed: boolean; reassess: string[] }>> {
  const campaign = await find(deps, input.workspaceId, input.campaignId);
  if (!campaign) return { ok: false, error: "NOT_FOUND" };
  const already = campaign.creatorIds.includes(input.creatorId);
  if (already === input.on) return { ok: true, name: campaign.name, changed: false, reassess: [] };
  try {
    if (input.on) await deps.campaigns.addCreator(input.workspaceId, campaign.id, input.creatorId);
    else await deps.campaigns.removeCreator(input.workspaceId, campaign.id, input.creatorId);
  } catch {
    // The creator isn't in this workspace.
    return { ok: false, error: "NOT_FOUND" };
  }
  return { ok: true, name: campaign.name, changed: true, reassess: await songsToReassess(input.workspaceId, deps) };
}
