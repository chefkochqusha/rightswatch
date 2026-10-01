import { getPrisma } from "@/lib/prisma-client";
import type { MusicTrack } from "@/generated/prisma/client";
import type { CatalogRepository, CatalogTrackChanges, CatalogTrackRecord, NewCatalogTrack, TrackSource } from "./types";

/** Songs in Postgres — the same contract as `InMemoryCatalogRepository`. */
export class PrismaCatalogRepository implements CatalogRepository {
  async findCatalogue(workspaceId: string): Promise<CatalogTrackRecord[]> {
    const rows = await getPrisma().musicTrack.findMany({
      where: { workspaceId, inCatalogue: true },
      orderBy: [{ addedAt: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(mapTrack);
  }

  async findById(workspaceId: string, id: string): Promise<CatalogTrackRecord | null> {
    const row = await getPrisma().musicTrack.findFirst({ where: { id, workspaceId } });
    return row ? mapTrack(row) : null;
  }

  async findAllKnown(workspaceId: string): Promise<CatalogTrackRecord[]> {
    const rows = await getPrisma().musicTrack.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } });
    return rows.map(mapTrack);
  }

  async create(input: NewCatalogTrack): Promise<CatalogTrackRecord> {
    return mapTrack(await getPrisma().musicTrack.create({ data: input }));
  }

  async update(id: string, changes: CatalogTrackChanges): Promise<CatalogTrackRecord> {
    return mapTrack(await getPrisma().musicTrack.update({ where: { id }, data: changes }));
  }
}

export function mapTrack(row: MusicTrack): CatalogTrackRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    artist: row.artist,
    isrc: row.isrc,
    album: row.album,
    durationMs: row.durationMs,
    catalogueId: row.catalogueId,
    rightsOwner: row.rightsOwner,
    publisher: row.publisher,
    label: row.label,
    notes: row.notes,
    source: row.source as TrackSource,
    externalId: row.externalId,
    artworkUrl: row.artworkUrl,
    inCatalogue: row.inCatalogue,
    addedAt: row.addedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
