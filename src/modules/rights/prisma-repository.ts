import { getPrisma } from "@/lib/prisma-client";
import type { RightsRecordRepository, RightsRecordRow, RightsRecordValues } from "./library";

/**
 * Rights records in Postgres — the same contract as
 * `InMemoryRightsRecordRepository`. Campaign scope is the schema's
 * "RightsRecordCampaigns" relation; the caller has already checked the
 * campaigns are the workspace's own (`parseRightsRecordForm`).
 * `getPrisma()`, never a top-level `prisma` binding — see
 * `src/lib/prisma-client.ts`.
 */

const INCLUDE = { campaigns: { select: { id: true } } } as const;

type Row = {
  id: string;
  workspaceId: string;
  musicTrackId: string;
  territories: string[];
  commercial: boolean;
  organic: boolean;
  startDate: Date;
  endDate: Date | null;
  notes: string | null;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
  campaigns: { id: string }[];
};

export class PrismaRightsRecordRepository implements RightsRecordRepository {
  async findForTrack(workspaceId: string, trackId: string): Promise<RightsRecordRow[]> {
    const rows = await getPrisma().rightsRecord.findMany({
      where: { workspaceId, musicTrackId: trackId },
      include: INCLUDE,
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(mapRow);
  }

  async findForWorkspace(workspaceId: string): Promise<RightsRecordRow[]> {
    const rows = await getPrisma().rightsRecord.findMany({
      where: { workspaceId },
      include: INCLUDE,
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(mapRow);
  }

  async findById(workspaceId: string, id: string): Promise<RightsRecordRow | null> {
    const row = await getPrisma().rightsRecord.findFirst({ where: { id, workspaceId }, include: INCLUDE });
    return row ? mapRow(row) : null;
  }

  async create(input: RightsRecordValues & { workspaceId: string; trackId: string }): Promise<RightsRecordRow> {
    const { campaignIds, trackId, ...values } = input;
    const row = await getPrisma().rightsRecord.create({
      data: { ...values, musicTrackId: trackId, campaigns: { connect: campaignIds.map((id) => ({ id })) } },
      include: INCLUDE,
    });
    return mapRow(row);
  }

  async update(id: string, values: RightsRecordValues): Promise<RightsRecordRow> {
    const { campaignIds, ...rest } = values;
    const row = await getPrisma().rightsRecord.update({
      where: { id },
      data: { ...rest, campaigns: { set: campaignIds.map((campaignId) => ({ id: campaignId })) } },
      include: INCLUDE,
    });
    return mapRow(row);
  }

  async delete(id: string): Promise<void> {
    await getPrisma().rightsRecord.delete({ where: { id } });
  }
}

function mapRow(row: Row): RightsRecordRow {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    trackId: row.musicTrackId,
    territories: row.territories,
    commercial: row.commercial,
    organic: row.organic,
    startDate: row.startDate,
    endDate: row.endDate,
    campaignIds: row.campaigns.map((campaign) => campaign.id),
    notes: row.notes,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
