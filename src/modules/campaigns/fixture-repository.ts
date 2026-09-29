import type { CampaignRecord, CampaignRepository } from './types';
import { FIXTURE_CAMPAIGN_MEMBERSHIPS_BY_CREATOR_ID } from './fixtures';

/**
 * Demo Mode's stand-in for a real, Prisma-backed campaign repository — same
 * role as `rights/fixture-repository.ts`'s `FixtureRightsRepository`. Once
 * the database is live, a real repository querying `Campaign` rows by
 * `creators: { some: { workspaceId, externalId: creatorExternalId } }` and
 * mapping them to `CampaignRecord` replaces this at the call site only.
 */
export class FixtureCampaignRepository implements CampaignRepository {
  async findForCreator(creatorExternalId: string): Promise<CampaignRecord[]> {
    return FIXTURE_CAMPAIGN_MEMBERSHIPS_BY_CREATOR_ID[creatorExternalId] ?? [];
  }
}
