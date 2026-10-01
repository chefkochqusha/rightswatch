import { randomUUID } from "node:crypto";
import type { NormalizedMusicMatch } from "../music/types";
import { IDENTIFICATION_NOT_COMPLETED } from "./types";
import type { ScanItemInput, ScanResultRepository, StoredScanItem } from "./types";

/**
 * The same contract as `PrismaScanResultRepository`, for tests: idempotent
 * per workspace and content id; a re-identified track keeps its
 * `rightsAssessmentId` (and so its Case); an earlier identification is never
 * erased by a later scan that finds none or fails; and a provider's error
 * text reads back as `IDENTIFICATION_NOT_COMPLETED`, because the schema has
 * nowhere to keep it.
 *
 * The identity of a track — ISRC when the provider supplies one, otherwise
 * title and artist — and of a match (content, track, provider) mirror the
 * Prisma version's lookups and unique keys exactly.
 */
export class InMemoryScanResultRepository implements ScanResultRepository {
  private readonly byWorkspace = new Map<string, Map<string, StoredScanItem>>();
  private readonly assessmentIds = new Map<string, string>();

  async saveScan(input: {
    workspaceId: string;
    musicProviderName: string;
    items: ScanItemInput[];
  }): Promise<StoredScanItem[]> {
    const stored = this.byWorkspace.get(input.workspaceId) ?? new Map<string, StoredScanItem>();
    this.byWorkspace.set(input.workspaceId, stored);

    return input.items.map((item) => {
      const next = this.merge(input.workspaceId, item, stored.get(item.content.externalContentId));
      stored.set(item.content.externalContentId, next);
      return next;
    });
  }

  async findForWorkspace(workspaceId: string): Promise<StoredScanItem[]> {
    const items = Array.from(this.byWorkspace.get(workspaceId)?.values() ?? []);
    return items.sort((a, b) => b.content.publishedAt.getTime() - a.content.publishedAt.getTime());
  }

  async findForCreator(workspaceId: string, creatorId: string): Promise<StoredScanItem[]> {
    return (await this.findForWorkspace(workspaceId)).filter((item) => item.creatorId === creatorId);
  }

  async findByContentId(workspaceId: string, externalContentId: string): Promise<StoredScanItem | null> {
    return this.byWorkspace.get(workspaceId)?.get(externalContentId) ?? null;
  }

  private merge(workspaceId: string, item: ScanItemInput, existing: StoredScanItem | undefined): StoredScanItem {
    const creator = {
      creatorId: item.creatorId,
      creatorExternalId: item.creatorExternalId,
      creatorUsername: item.creatorUsername,
    };

    if (item.kind === "ASSESSED") {
      const key = [workspaceId, item.content.externalContentId, trackKey(item.musicMatch), item.musicMatch.provider].join("|");
      const rightsAssessmentId = this.assessmentIds.get(key) ?? randomUUID();
      this.assessmentIds.set(key, rightsAssessmentId);
      return { ...item, ...creator, rightsAssessmentId };
    }

    // Nothing identified this time: keep what an earlier scan identified —
    // with this scan's view of the content itself.
    if (existing?.kind === "ASSESSED") {
      return { ...existing, ...creator, content: item.content };
    }
    if (item.kind === "NO_MUSIC_MATCH" || existing?.kind === "NO_MUSIC_MATCH") {
      return { kind: "NO_MUSIC_MATCH", content: item.content, ...creator, rightsAssessmentId: null };
    }
    return {
      kind: "MUSIC_ID_ERROR",
      content: item.content,
      error: IDENTIFICATION_NOT_COMPLETED,
      ...creator,
      rightsAssessmentId: null,
    };
  }
}

function trackKey(match: NormalizedMusicMatch): string {
  return match.isrc ? `isrc:${match.isrc}` : `title:${match.title}|artist:${match.artist}`;
}
