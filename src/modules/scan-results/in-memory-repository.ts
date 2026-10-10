import { randomUUID } from "node:crypto";
import type { NormalizedMusicMatch } from "../music/types";
import type { RightsAssessmentResult } from "../rights-engine/types";
import { IDENTIFICATION_NOT_COMPLETED, MANUAL_IDENTIFICATION } from "./types";
import type { IdentificationSource, ScanItemInput, ScanResultRepository, StoredScanItem, TrackMatchForAssessment } from "./types";

/**
 * The same contract as `PrismaScanResultRepository`, for tests: idempotent
 * per workspace and content id; a re-identified track keeps its
 * `rightsAssessmentId` (and so its Case); an assessed identification
 * outranks one that isn't, and nothing identified is ever erased by a later
 * scan that finds none or fails; and a provider's error text reads back as
 * `IDENTIFICATION_NOT_COMPLETED`, because the schema has nowhere to keep it.
 *
 * The identity of a track — ISRC when the provider supplies one, otherwise
 * title and artist — and of a match (content, track, provider) mirror the
 * Prisma version's lookups and unique keys. A track's id is whatever the
 * item carried: there's no track table here to resolve it against.
 */
export class InMemoryScanResultRepository implements ScanResultRepository {
  private readonly byWorkspace = new Map<string, Map<string, StoredScanItem>>();
  private readonly assessmentIds = new Map<string, string>();

  async saveScan(input: {
    workspaceId: string;
    musicProviderName: string;
    items: ScanItemInput[];
  }): Promise<StoredScanItem[]> {
    const stored = this.itemsOf(input.workspaceId);
    return input.items.map((item) => {
      const next = this.merge(input.workspaceId, item, stored.get(item.content.externalContentId));
      stored.set(item.content.externalContentId, next);
      return next;
    });
  }

  async findForWorkspace(workspaceId: string): Promise<StoredScanItem[]> {
    return newestFirst(Array.from(this.byWorkspace.get(workspaceId)?.values() ?? []));
  }

  async findForCreator(workspaceId: string, creatorId: string): Promise<StoredScanItem[]> {
    return (await this.findForWorkspace(workspaceId)).filter((item) => item.creatorId === creatorId);
  }

  async findByContentId(workspaceId: string, externalContentId: string): Promise<StoredScanItem | null> {
    return this.byWorkspace.get(workspaceId)?.get(externalContentId) ?? null;
  }

  async findForTrack(workspaceId: string, trackId: string): Promise<StoredScanItem[]> {
    return (await this.findForWorkspace(workspaceId)).filter((item) => trackOf(item) === trackId);
  }

  async reassessTrack(input: {
    workspaceId: string;
    trackId: string;
    assess: (match: TrackMatchForAssessment) => Promise<RightsAssessmentResult>;
  }): Promise<StoredScanItem[]> {
    const stored = this.itemsOf(input.workspaceId);
    const reassessed: StoredScanItem[] = [];
    for (const item of stored.values()) {
      if ((item.kind !== "ASSESSED" && item.kind !== "OTHER_MUSIC") || item.musicMatch.trackId !== input.trackId) continue;
      const { creatorId, creatorExternalId, creatorUsername, content, musicMatch } = item;
      const assessment = await input.assess({ creatorId, creatorExternalId, creatorUsername, content, musicMatch });
      const next: StoredScanItem = {
        kind: "ASSESSED",
        content,
        musicMatch,
        assessment,
        creatorId,
        creatorExternalId,
        creatorUsername,
        rightsAssessmentId: this.assessmentId(input.workspaceId, content.externalContentId, musicMatch),
      };
      stored.set(content.externalContentId, next);
      reassessed.push(next);
    }
    return newestFirst(reassessed);
  }

  async identifyPost(input: {
    workspaceId: string;
    externalContentId: string;
    track: { id: string; title: string; artist: string | null; isrc: string | null };
    assess: (match: TrackMatchForAssessment) => Promise<RightsAssessmentResult>;
    source?: IdentificationSource;
  }): Promise<StoredScanItem | null> {
    const source = input.source ?? MANUAL_IDENTIFICATION;
    const stored = this.itemsOf(input.workspaceId);
    const existing = stored.get(input.externalContentId);
    if (!existing) return null;

    const musicMatch: NormalizedMusicMatch = {
      trackId: input.track.id,
      title: input.track.title,
      artist: input.track.artist ?? "",
      isrc: input.track.isrc,
      confidence: source.confidence,
      provider: source.provider,
      manual: source.manual,
    };
    const { creatorId, creatorExternalId, creatorUsername, content } = existing;
    const assessment = await input.assess({ creatorId, creatorExternalId, creatorUsername, content, musicMatch });
    const next: StoredScanItem = {
      kind: "ASSESSED",
      content,
      musicMatch,
      assessment,
      creatorId,
      creatorExternalId,
      creatorUsername,
      rightsAssessmentId: this.assessmentId(input.workspaceId, content.externalContentId, musicMatch),
    };
    stored.set(content.externalContentId, next);
    return next;
  }

  private itemsOf(workspaceId: string): Map<string, StoredScanItem> {
    const stored = this.byWorkspace.get(workspaceId) ?? new Map<string, StoredScanItem>();
    this.byWorkspace.set(workspaceId, stored);
    return stored;
  }

  private assessmentId(workspaceId: string, contentId: string, match: NormalizedMusicMatch): string {
    const key = [workspaceId, contentId, trackKey(match), match.provider].join("|");
    const id = this.assessmentIds.get(key) ?? randomUUID();
    this.assessmentIds.set(key, id);
    return id;
  }

  private merge(workspaceId: string, item: ScanItemInput, existing: StoredScanItem | undefined): StoredScanItem {
    const creator = {
      creatorId: item.creatorId,
      creatorExternalId: item.creatorExternalId,
      creatorUsername: item.creatorUsername,
    };

    if (item.kind === "ASSESSED") {
      const rightsAssessmentId = this.assessmentId(workspaceId, item.content.externalContentId, item.musicMatch);
      return { ...item, ...creator, rightsAssessmentId };
    }

    // An assessed identification outranks anything that isn't — with this
    // scan's view of the content itself.
    if (existing?.kind === "ASSESSED") {
      return { ...existing, ...creator, content: item.content };
    }
    if (item.kind === "OTHER_MUSIC") {
      return { ...item, ...creator, rightsAssessmentId: null };
    }
    // Nothing identified this time: keep what an earlier scan identified.
    if (existing?.kind === "OTHER_MUSIC") {
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

function trackOf(item: StoredScanItem): string | null {
  return item.kind === "ASSESSED" || item.kind === "OTHER_MUSIC" ? item.musicMatch.trackId : null;
}

function trackKey(match: NormalizedMusicMatch): string {
  return match.isrc ? `isrc:${match.isrc}` : `title:${match.title}|artist:${match.artist}`;
}

function newestFirst(items: StoredScanItem[]): StoredScanItem[] {
  return items.sort((a, b) => b.content.publishedAt.getTime() - a.content.publishedAt.getTime());
}
