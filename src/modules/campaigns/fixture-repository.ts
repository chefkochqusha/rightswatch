import type { CampaignRecord, CampaignRepository } from './types';
import { DEMO_CAMPAIGNS } from '../demo-data/catalog';

/**
 * The demo dataset's campaigns (`modules/demo-data/catalog.ts`), looked up
 * by the creator's external id — for a TikTok creator, the username. A
 * workspace's own campaigns (Brief §2: "assign creators to
 * campaigns/projects") implement the same interface from `Campaign` rows.
 */
export class FixtureCampaignRepository implements CampaignRepository {
  async findForCreator(creatorExternalId: string): Promise<CampaignRecord[]> {
    const handle = creatorExternalId.toLowerCase();
    return Object.values(DEMO_CAMPAIGNS)
      .filter((campaign) => (campaign.members as readonly string[]).includes(handle))
      .map(({ id, name, createdAt }) => ({ id, name, createdAt }));
  }
}
