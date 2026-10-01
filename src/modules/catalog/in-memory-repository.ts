import { randomUUID } from "node:crypto";
import type { CatalogRepository, CatalogTrackChanges, CatalogTrackRecord, NewCatalogTrack } from "./types";

/** The same contract as `PrismaCatalogRepository`, for tests. */
export class InMemoryCatalogRepository implements CatalogRepository {
  private readonly byId = new Map<string, CatalogTrackRecord>();

  async findCatalogue(workspaceId: string): Promise<CatalogTrackRecord[]> {
    return Array.from(this.byId.values())
      .filter((track) => track.workspaceId === workspaceId && track.inCatalogue)
      .sort((a, b) => (b.addedAt?.getTime() ?? 0) - (a.addedAt?.getTime() ?? 0))
      .map((track) => ({ ...track }));
  }

  async findById(workspaceId: string, id: string): Promise<CatalogTrackRecord | null> {
    const track = this.byId.get(id);
    return track && track.workspaceId === workspaceId ? { ...track } : null;
  }

  async findAllKnown(workspaceId: string): Promise<CatalogTrackRecord[]> {
    return Array.from(this.byId.values())
      .filter((track) => track.workspaceId === workspaceId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((track) => ({ ...track }));
  }

  async create(input: NewCatalogTrack): Promise<CatalogTrackRecord> {
    const now = new Date();
    const track: CatalogTrackRecord = {
      id: randomUUID(),
      ...input,
      catalogueId: null,
      rightsOwner: null,
      publisher: null,
      label: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(track.id, track);
    return { ...track };
  }

  async update(id: string, changes: CatalogTrackChanges): Promise<CatalogTrackRecord> {
    const existing = this.byId.get(id);
    if (!existing) throw new Error(`InMemoryCatalogRepository.update: no track with id "${id}"`);
    const updated = { ...existing, ...changes, updatedAt: new Date() };
    this.byId.set(id, updated);
    return { ...updated };
  }
}
