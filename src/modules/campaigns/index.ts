export type { CampaignDirectory, CampaignRecord, CampaignRepository, WorkspaceCampaign } from './types';
export { FixtureCampaignRepository } from './fixture-repository';
// The Prisma implementations are deliberately not re-exported — they import
// `@/lib/prisma-client`; import them from "@/modules/campaigns/prisma-repository".
