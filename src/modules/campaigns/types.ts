/**
 * Campaign lookup (Master Brief §11 lists Campaign as a Rights Engine input;
 * `prisma/schema.prisma`'s `Campaign` model is `{ id, workspaceId, name,
 * createdAt, creators: Creator[] }` — a many-to-many with `Creator` via the
 * "CampaignCreators" relation, not a field on `Content`). A piece of content
 * doesn't carry its own campaign directly; it inherits campaign membership
 * from the creator who posted it.
 *
 * `CampaignRecord` deliberately does NOT carry `workspaceId`, unlike
 * `cases/types.ts`'s `CaseRecord`. Cases are created *through this app*
 * (`openCase`) and persisted per-workspace, so `workspaceId` is real,
 * load-bearing identifying data for them. Campaigns, like RightsRecords
 * (`rights-engine/types.ts`'s `RightsRecordInput`, which also omits
 * `workspaceId`), are reference data the workspace already has on file —
 * nothing in this app creates or edits a Campaign yet, so there's no
 * `InMemoryCampaignRepository` here, only a fixture-backed one, exactly
 * mirroring `modules/rights`'s shape (`FixtureRightsRepository`, no CRUD
 * repository). A real Prisma-backed `CampaignRepository` scopes its own
 * query by workspaceId internally (`WHERE workspaceId = ? AND creators =
 * { some: { id: creatorId } }`) without needing to round-trip it through
 * this return shape.
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
