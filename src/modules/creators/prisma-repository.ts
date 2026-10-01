import { getPrisma } from "@/lib/prisma-client";
import type { Creator } from "@/generated/prisma/client";
import type { Platform } from "../connectors/types";
import type { CreatorChanges, CreatorRecord, CreatorRepository, NewCreator } from "./types";
import { DuplicateCreatorError } from "./watchlist";

/**
 * Creators in Postgres — the same contract as `InMemoryCreatorRepository`.
 * `getPrisma()`, never a top-level `prisma` binding — see
 * `src/lib/prisma-client.ts`.
 */
export class PrismaCreatorRepository implements CreatorRepository {
  async create(input: NewCreator): Promise<CreatorRecord> {
    try {
      return mapCreator(await getPrisma().creator.create({ data: input }));
    } catch (error) {
      // P2002: the (workspaceId, platform, externalId) key — another add of
      // the same creator got there first.
      if ((error as { code?: unknown } | null)?.code === "P2002") throw new DuplicateCreatorError();
      throw error;
    }
  }

  async findById(workspaceId: string, id: string): Promise<CreatorRecord | null> {
    const row = await getPrisma().creator.findFirst({ where: { id, workspaceId } });
    return row ? mapCreator(row) : null;
  }

  async findByExternalId(workspaceId: string, platform: Platform, externalId: string): Promise<CreatorRecord | null> {
    const row = await getPrisma().creator.findUnique({
      where: { workspaceId_platform_externalId: { workspaceId, platform, externalId } },
    });
    return row ? mapCreator(row) : null;
  }

  async findForWorkspace(workspaceId: string): Promise<CreatorRecord[]> {
    const rows = await getPrisma().creator.findMany({
      where: { workspaceId, removedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(mapCreator);
  }

  async countMonitored(workspaceId: string): Promise<number> {
    return getPrisma().creator.count({ where: { workspaceId, removedAt: null, monitoringEnabled: true } });
  }

  async update(id: string, changes: CreatorChanges): Promise<CreatorRecord> {
    return mapCreator(await getPrisma().creator.update({ where: { id }, data: changes }));
  }
}

function mapCreator(row: Creator): CreatorRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    platform: row.platform,
    externalId: row.externalId,
    handle: row.handle,
    displayName: row.displayName,
    profileUrl: row.profileUrl,
    country: row.country,
    followerCount: row.followerCount,
    status: row.status,
    monitoringEnabled: row.monitoringEnabled,
    lastSeenAt: row.lastSeenAt,
    lastError: row.lastError,
    removedAt: row.removedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
