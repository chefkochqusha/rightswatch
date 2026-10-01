import { getPrisma } from "@/lib/prisma-client";
import type { CampaignDirectory, CampaignRecord, CampaignRepository, WorkspaceCampaign } from "./types";

/**
 * A workspace's campaigns in Postgres (`Campaign`, many-to-many with
 * `Creator` through "CampaignCreators"). `getPrisma()`, never a top-level
 * `prisma` binding — see `src/lib/prisma-client.ts`.
 */

/** The scan pipeline's view, scoped to one workspace when it's built (see
 *  `types.ts`): a creator's campaigns by its external id — for TikTok, the
 *  username. */
export class PrismaCampaignRepository implements CampaignRepository {
  constructor(private readonly workspaceId: string) {}

  async findForCreator(creatorExternalId: string): Promise<CampaignRecord[]> {
    return getPrisma().campaign.findMany({
      where: { workspaceId: this.workspaceId, creators: { some: { workspaceId: this.workspaceId, externalId: creatorExternalId } } },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }
}

export class PrismaCampaignDirectory implements CampaignDirectory {
  async findForWorkspace(workspaceId: string): Promise<WorkspaceCampaign[]> {
    const rows = await getPrisma().campaign.findMany({
      where: { workspaceId },
      select: { id: true, name: true, createdAt: true, creators: { select: { id: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(({ creators, ...campaign }) => ({ ...campaign, creatorIds: creators.map((creator) => creator.id) }));
  }

  async findForCreatorId(workspaceId: string, creatorId: string): Promise<CampaignRecord[]> {
    return getPrisma().campaign.findMany({
      where: { workspaceId, creators: { some: { id: creatorId, workspaceId } } },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async ensure(workspaceId: string, name: string): Promise<WorkspaceCampaign> {
    const existing = (await this.findForWorkspace(workspaceId)).find((campaign) => campaign.name === name);
    if (existing) return existing;
    const created = await getPrisma().campaign.create({ data: { workspaceId, name }, select: { id: true, name: true, createdAt: true } });
    return { ...created, creatorIds: [] };
  }

  async addCreator(workspaceId: string, campaignId: string, creatorId: string): Promise<void> {
    const [campaign, creator] = await Promise.all([
      getPrisma().campaign.findFirst({ where: { id: campaignId, workspaceId }, select: { id: true } }),
      getPrisma().creator.findFirst({ where: { id: creatorId, workspaceId }, select: { id: true } }),
    ]);
    if (!campaign || !creator) throw new Error("That campaign or creator isn't in this workspace.");
    await getPrisma().campaign.update({ where: { id: campaign.id }, data: { creators: { connect: { id: creator.id } } } });
  }
}
