export type { CampaignDirectory, CampaignRecord, CampaignRepository, WorkspaceCampaign } from './types';
export { FixtureCampaignRepository } from './fixture-repository';
export { InMemoryCampaignDirectory } from './in-memory-directory';
export { CAMPAIGN_NAME_MAX, createCampaign, deleteCampaign, renameCampaign, setCreatorOnCampaign, songsToReassess } from './manage';
export type { CampaignDependencies, CampaignError } from './manage';
// The Prisma implementations are deliberately not re-exported — they import
// `@/lib/prisma-client`; import them from "@/modules/campaigns/prisma-repository".
