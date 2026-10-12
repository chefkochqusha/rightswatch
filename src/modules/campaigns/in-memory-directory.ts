import { randomUUID } from "node:crypto";
import type { CampaignDirectory, CampaignRecord, WorkspaceCampaign } from "./types";

/** Process-memory `CampaignDirectory` for tests. `creatorWorkspace` says which
 *  workspace each known creator id belongs to, as the creators table would. */
export class InMemoryCampaignDirectory implements CampaignDirectory {
  private readonly rows = new Map<string, WorkspaceCampaign & { workspaceId: string }>();
  constructor(private readonly creatorWorkspace: Map<string, string> = new Map()) {}

  async findForWorkspace(workspaceId: string): Promise<WorkspaceCampaign[]> {
    return [...this.rows.values()]
      .filter((c) => c.workspaceId === workspaceId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(({ workspaceId: _ws, ...c }) => ({ ...c, creatorIds: [...c.creatorIds] }));
  }

  async findForCreatorId(workspaceId: string, creatorId: string): Promise<CampaignRecord[]> {
    return (await this.findForWorkspace(workspaceId))
      .filter((c) => c.creatorIds.includes(creatorId))
      .map(({ id, name, createdAt }) => ({ id, name, createdAt }));
  }

  async ensure(workspaceId: string, name: string): Promise<WorkspaceCampaign> {
    const existing = (await this.findForWorkspace(workspaceId)).find((c) => c.name === name);
    if (existing) return existing;
    const row = { id: randomUUID(), workspaceId, name, createdAt: new Date(Date.now() + this.rows.size), creatorIds: [] as string[] };
    this.rows.set(row.id, row);
    return { id: row.id, name, createdAt: row.createdAt, creatorIds: [] };
  }

  private own(workspaceId: string, campaignId: string) {
    const row = this.rows.get(campaignId);
    if (!row || row.workspaceId !== workspaceId) throw new Error("That campaign isn't in this workspace.");
    return row;
  }

  async addCreator(workspaceId: string, campaignId: string, creatorId: string): Promise<void> {
    const row = this.own(workspaceId, campaignId);
    if (this.creatorWorkspace.get(creatorId) !== workspaceId) throw new Error("That campaign or creator isn't in this workspace.");
    if (!row.creatorIds.includes(creatorId)) row.creatorIds.push(creatorId);
  }

  async removeCreator(workspaceId: string, campaignId: string, creatorId: string): Promise<void> {
    const row = this.own(workspaceId, campaignId);
    row.creatorIds = row.creatorIds.filter((id) => id !== creatorId);
  }

  async rename(workspaceId: string, campaignId: string, name: string): Promise<void> {
    this.own(workspaceId, campaignId).name = name;
  }

  async delete(workspaceId: string, campaignId: string): Promise<void> {
    const row = this.rows.get(campaignId);
    if (row?.workspaceId === workspaceId) this.rows.delete(campaignId);
  }
}
