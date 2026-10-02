import { assessCommercialContent } from "@/modules/scan-pipeline";
import { toRightsRecordInput } from "@/modules/rights";
import { PrismaCampaignRepository } from "@/modules/campaigns/prisma-repository";
import type { CreatorRecord } from "@/modules/creators";
import { getScanResultStore } from "./scan-result-store";
import { getCreatorStore } from "./creator-store";
import { getLibraryStore } from "./library-store";
import { openCasesForFlaggedItems } from "./case-automation";

/**
 * Re-assesses every post a catalogue song was found in, between scans —
 * after the song joins the catalogue (posts a scan had recorded as "other
 * music" are assessed for the first time) or its rights records change
 * (Brief §10: the Rights Library is what the verdicts rest on, so a
 * verdict must follow it). The same engine step a scan runs
 * (`assessCommercialContent`), then the same case automation (§51).
 *
 * A song that isn't in the catalogue is left as it is: nothing about it is
 * assessed.
 */
/**
 * The engine step for one workspace's posts: country and campaigns looked up
 * once per creator, the song's rights records given. Shared by re-assessing a
 * song and by a person identifying a post's song by hand.
 */
export function makeAssessor(workspaceId: string, rightsRecords: ReturnType<typeof toRightsRecordInput>[]) {
  const campaigns = new PrismaCampaignRepository(workspaceId);
  const creatorRepository = getCreatorStore().creators;
  const creators = new Map<string, Promise<CreatorRecord | null>>();
  const campaignIds = new Map<string, Promise<string[]>>();

  return async (match: { creatorId: string; creatorExternalId: string; content: Parameters<typeof assessCommercialContent>[0]["content"] }) => {
    if (!creators.has(match.creatorId)) creators.set(match.creatorId, creatorRepository.findById(workspaceId, match.creatorId));
    if (!campaignIds.has(match.creatorExternalId)) {
      campaignIds.set(
        match.creatorExternalId,
        campaigns.findForCreator(match.creatorExternalId).then((rows) => rows.map((campaign) => campaign.id)),
      );
    }
    return assessCommercialContent({
      content: match.content,
      creatorCountry: (await creators.get(match.creatorId))?.country ?? null,
      campaignIds: await campaignIds.get(match.creatorExternalId)!,
      rightsRecords,
    });
  };
}

export async function reassessSong(
  workspaceId: string,
  trackId: string,
  /** Who changed what made this necessary — the actor of any case opened. */
  actorUserId: string,
): Promise<{ posts: number; casesOpened: number }> {
  const library = getLibraryStore();
  const track = await library.catalog.findById(workspaceId, trackId);
  if (!track?.inCatalogue) return { posts: 0, casesOpened: 0 };

  const rightsRecords = (await library.rights.findForTrack(workspaceId, trackId)).map(toRightsRecordInput);
  const items = await getScanResultStore().results.reassessTrack({
    workspaceId,
    trackId,
    assess: makeAssessor(workspaceId, rightsRecords),
  });

  const casesOpened = await openCasesForFlaggedItems(workspaceId, actorUserId, items);
  return { posts: items.length, casesOpened };
}
