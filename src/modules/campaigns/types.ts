/**
 * Campaign lookup (Master Brief §11 lists Campaign as a Rights Engine input;
 * `prisma/schema.prisma`'s `Campaign` model is `{ id, workspaceId, name,
 * createdAt, creators: Creator[] }` — a many-to-many with `Creator` via the
 * "CampaignCreators" relation, not a field on `Content`). A piece of content
 * doesn't carry its own campaign directly; it inherits campaign membership
 * from the creator who posted it.
 *
 * `CampaignRecord` carries no `workspaceId`: a repository is scoped to one
 * workspace when it's built (a Prisma-backed one queries `WHERE
 * workspaceId = ? AND creators: { some: … }`), so the id would only ever
 * repeat what the caller already knows. Campaigns are workspace data users
 * manage (Brief §2: "assign creators to campaigns/projects"); until that's
 * built, `FixtureCampaignRepository` serves the demo dataset's campaigns.
 */

export interface CampaignRecord {
  id: string;
  name: string;
  createdAt: Date;
}

export interface CampaignRepository {
  /**
   * Every campaign this creator currently belongs to — zero, one, or more,
   * since `Campaign.creators` is many-to-many (a creator can be signed to
   * more than one active campaign at once). Callers that need a single
   * campaign id (the scan pipeline, for the Rights Engine's `campaignId`
   * input) decide how to reduce this list themselves; this repository only
   * reports the membership as it actually is.
   */
  findForCreator(creatorExternalId: string): Promise<CampaignRecord[]>;
}
