import { getPrisma } from "@/lib/prisma-client";
import type { Prisma } from "@/generated/prisma/client";
import type { NormalizedCommercialContent, Platform } from "../connectors/types";
import type { NormalizedMusicMatch } from "../music/types";
import type { RightsAssessmentReason, RightsAssessmentResult, RightsAssessmentStatus } from "../rights-engine/types";
import { findSameTrack, normalizeIsrc } from "../catalog/identity";
import { IDENTIFICATION_NOT_COMPLETED, MANUAL_IDENTIFICATION } from "./types";
import type { IdentificationSource, RejectedIdentification, ScanItemInput, ScanResultRepository, StoredScanItem, TrackMatchForAssessment } from "./types";

/**
 * Scan results in Postgres (see `types.ts` for the chain and the contract).
 * Each item's chain is written in its own transaction — Creator, Content and
 * CommercialContent always; then the MusicMatch an identification produced,
 * and the RightsAssessment for a catalogue song — upserted on the schema's
 * own unique keys, so saving a scan twice touches the same rows (Brief §22).
 *
 * Tracks: an assessed item already carries its catalogue song's id (the
 * scan resolved it). A song outside the catalogue is recorded as one the
 * workspace knows but doesn't administer (`inCatalogue` false) — found by
 * ISRC, source id, or title and artist (`catalog/identity.ts`), and created
 * only when it's new — so adding it to the catalogue later finds its posts.
 *
 * `getPrisma()`, never a top-level `prisma` binding — see
 * `src/lib/prisma-client.ts`.
 */

const CONTENT_INCLUDE = {
  creator: true,
  commercialContent: {
    include: {
      musicMatches: {
        where: { rejectedAt: null },
        include: { musicTrack: true, rightsAssessment: true },
        orderBy: { matchedAt: "desc" },
      },
    },
  },
} satisfies Prisma.ContentInclude;

type ContentRow = Prisma.ContentGetPayload<{ include: typeof CONTENT_INCLUDE }>;

/** What `findSameTrack` needs of a workspace's known songs. */
interface KnownTrack {
  id: string;
  title: string;
  artist: string | null;
  isrc: string | null;
  externalId: string | null;
}

export class PrismaScanResultRepository implements ScanResultRepository {
  async saveScan(input: {
    workspaceId: string;
    musicProviderName: string;
    items: ScanItemInput[];
  }): Promise<StoredScanItem[]> {
    // Read once per scan, and added to as songs are recorded below.
    const known: KnownTrack[] = await getPrisma().musicTrack.findMany({
      where: { workspaceId: input.workspaceId },
      select: { id: true, title: true, artist: true, isrc: true, externalId: true },
      orderBy: { createdAt: "asc" },
    });

    const stored: StoredScanItem[] = [];
    for (const item of input.items) {
      const contentRowId = await getPrisma().$transaction((tx) =>
        writeItem(tx, input.workspaceId, input.musicProviderName, item, known),
      );
      const row = await getPrisma().content.findUniqueOrThrow({
        where: { id: contentRowId },
        include: CONTENT_INCLUDE,
      });
      const readBack = toStoredItem(row);
      if (!readBack) throw new Error(`Content ${contentRowId} was saved without its commercial content.`);
      stored.push(readBack);
    }
    return stored;
  }

  async findForWorkspace(workspaceId: string): Promise<StoredScanItem[]> {
    const rows = await getPrisma().content.findMany({
      where: { creator: { workspaceId } },
      include: CONTENT_INCLUDE,
      orderBy: { publishedAt: "desc" },
    });
    return toStoredItems(rows);
  }

  async findForCreator(workspaceId: string, creatorId: string): Promise<StoredScanItem[]> {
    const rows = await getPrisma().content.findMany({
      where: { creatorId, creator: { workspaceId } },
      include: CONTENT_INCLUDE,
      orderBy: { publishedAt: "desc" },
    });
    return toStoredItems(rows);
  }

  async findByContentId(workspaceId: string, externalContentId: string): Promise<StoredScanItem | null> {
    // A video belongs to one creator, so within a workspace its platform id
    // is unique in practice; the workspace filter is what keeps another
    // workspace's copy of the same video out.
    const row = await getPrisma().content.findFirst({
      where: { externalContentId, creator: { workspaceId } },
      include: CONTENT_INCLUDE,
    });
    return row ? toStoredItem(row) : null;
  }

  async findForTrack(workspaceId: string, trackId: string): Promise<StoredScanItem[]> {
    const rows = await getPrisma().content.findMany({
      where: {
        creator: { workspaceId },
        commercialContent: { musicMatches: { some: { musicTrackId: trackId, rejectedAt: null } } },
      },
      include: CONTENT_INCLUDE,
      orderBy: { publishedAt: "desc" },
    });
    // A post another song outranks (a newer identification) is that song's.
    return toStoredItems(rows).filter(
      (item) => (item.kind === "ASSESSED" || item.kind === "OTHER_MUSIC") && item.musicMatch.trackId === trackId,
    );
  }

  async reassessTrack(input: {
    workspaceId: string;
    trackId: string;
    assess: (match: TrackMatchForAssessment) => Promise<RightsAssessmentResult>;
  }): Promise<StoredScanItem[]> {
    const matches = await getPrisma().musicMatch.findMany({
      where: {
        musicTrackId: input.trackId,
        rejectedAt: null,
        musicTrack: { workspaceId: input.workspaceId },
        commercialContent: { content: { creator: { workspaceId: input.workspaceId } } },
      },
      include: {
        musicTrack: true,
        commercialContent: { include: { content: { include: { creator: true } } } },
      },
    });

    for (const match of matches) {
      if (!match.musicTrack) continue;
      const row = match.commercialContent.content;
      const assessment = await input.assess({
        content: toContent(row, match.commercialContent),
        musicMatch: toMusicMatch(match, match.musicTrack),
        creatorId: row.creator.id,
        creatorExternalId: row.creator.externalId,
        creatorUsername: row.creator.handle,
      });
      const verdict = toVerdict(assessment);
      await getPrisma().rightsAssessment.upsert({
        where: { musicMatchId: match.id },
        create: { musicMatchId: match.id, ...verdict },
        update: { ...verdict, assessedAt: new Date() },
      });
    }

    const rows = await getPrisma().content.findMany({
      where: { id: { in: matches.map((match) => match.commercialContent.contentId) } },
      include: CONTENT_INCLUDE,
      orderBy: { publishedAt: "desc" },
    });
    return toStoredItems(rows);
  }

  async identifyPost(input: {
    workspaceId: string;
    externalContentId: string;
    track: { id: string; title: string; artist: string | null; isrc: string | null };
    assess: (match: TrackMatchForAssessment) => Promise<RightsAssessmentResult>;
    source?: IdentificationSource;
  }): Promise<StoredScanItem | null> {
    const source = input.source ?? MANUAL_IDENTIFICATION;
    const prisma = getPrisma();
    const row = await prisma.content.findFirst({
      where: { externalContentId: input.externalContentId, creator: { workspaceId: input.workspaceId } },
      include: { creator: true, commercialContent: true },
    });
    if (!row?.commercialContent) return null;
    // The song must be this workspace's, never another's.
    const track = await prisma.musicTrack.findFirst({ where: { id: input.track.id, workspaceId: input.workspaceId }, select: { id: true } });
    if (!track) throw new Error(`Track ${input.track.id} isn't in workspace ${input.workspaceId}.`);

    const musicMatch: NormalizedMusicMatch = {
      trackId: input.track.id,
      title: input.track.title,
      artist: input.track.artist ?? "",
      isrc: input.track.isrc,
      confidence: source.confidence,
      provider: source.provider,
      manual: source.manual,
    };
    const assessment = await input.assess({
      content: toContent(row, row.commercialContent),
      musicMatch,
      creatorId: row.creator.id,
      creatorExternalId: row.creator.externalId,
      creatorUsername: row.creator.handle,
    });
    const verdict = toVerdict(assessment);

    await prisma.$transaction(async (tx) => {
      const match = await tx.musicMatch.upsert({
        where: {
          commercialContentId_musicTrackId_provider: {
            commercialContentId: row.commercialContent!.id,
            musicTrackId: track.id,
            provider: source.provider,
          },
        },
        create: { commercialContentId: row.commercialContent!.id, musicTrackId: track.id, provider: source.provider, confidence: source.confidence, manual: source.manual },
        update: { confidence: source.confidence, manual: source.manual, matchedAt: new Date(), rejectedAt: null, rejectedById: null, rejectionNote: null },
      });
      await tx.rightsAssessment.upsert({
        where: { musicMatchId: match.id },
        create: { musicMatchId: match.id, ...verdict },
        update: { ...verdict, assessedAt: new Date() },
      });
    });

    const fresh = await prisma.content.findUniqueOrThrow({ where: { id: row.id }, include: CONTENT_INCLUDE });
    return toStoredItem(fresh);
  }

  async rejectIdentification(input: {
    workspaceId: string;
    externalContentId: string;
    rejectedById: string;
    note: string | null;
  }): Promise<RejectedIdentification | null> {
    const prisma = getPrisma();
    const row = await prisma.content.findFirst({
      where: { externalContentId: input.externalContentId, creator: { workspaceId: input.workspaceId } },
      include: CONTENT_INCLUDE,
    });
    const matches = row?.commercialContent?.musicMatches ?? [];
    // The same choice `toStoredItem` makes: the newest assessed one, else the newest with a song.
    const current = matches.find((m) => m.musicTrack && m.rightsAssessment) ?? matches.find((m) => m.musicTrack);
    if (!current?.musicTrack) return null;
    await prisma.musicMatch.update({
      where: { id: current.id },
      data: { rejectedAt: new Date(), rejectedById: input.rejectedById, rejectionNote: input.note?.slice(0, 500) ?? null },
    });
    return {
      trackId: current.musicTrack.id,
      title: current.musicTrack.title,
      provider: current.provider,
      rightsAssessmentId: current.rightsAssessment?.id ?? null,
    };
  }
}

async function writeItem(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  musicProviderName: string,
  item: ScanItemInput,
  known: KnownTrack[],
): Promise<string> {
  const { content } = item;

  // The creator is on this workspace's watchlist already — a scan never
  // adds one. Checked inside the transaction so an item can't be filed
  // under another workspace's creator.
  const creator = await tx.creator.findFirst({ where: { id: item.creatorId, workspaceId }, select: { id: true } });
  if (!creator) throw new Error(`Creator ${item.creatorId} isn't in workspace ${workspaceId}.`);

  const contentRow = await tx.content.upsert({
    where: { creatorId_externalContentId: { creatorId: creator.id, externalContentId: content.externalContentId } },
    create: {
      creatorId: creator.id,
      platform: content.platform,
      externalContentId: content.externalContentId,
      publishedAt: content.publishedAt,
    },
    update: { publishedAt: content.publishedAt },
  });

  const commercialFields = {
    label: content.label,
    brandNames: content.brandNames,
    videoUrls: content.videoUrls,
    territory: content.territory,
    rawPayload: (content.rawPayload ?? {}) as Prisma.InputJsonValue,
  };
  const commercial = await tx.commercialContent.upsert({
    where: { contentId: contentRow.id },
    create: { contentId: contentRow.id, ...commercialFields },
    update: commercialFields,
  });

  if (item.kind === "ASSESSED" || item.kind === "OTHER_MUSIC") {
    const trackId =
      item.kind === "ASSESSED"
        ? await catalogueTrackId(tx, workspaceId, item.musicMatch.trackId)
        : await recordIdentifiedTrack(tx, workspaceId, item.musicMatch, known);
    const match = await tx.musicMatch.upsert({
      where: {
        commercialContentId_musicTrackId_provider: {
          commercialContentId: commercial.id,
          musicTrackId: trackId,
          provider: item.musicMatch.provider,
        },
      },
      create: {
        commercialContentId: commercial.id,
        musicTrackId: trackId,
        provider: item.musicMatch.provider,
        confidence: item.musicMatch.confidence,
        manual: item.musicMatch.manual,
      },
      update: {
        confidence: item.musicMatch.confidence,
        manual: item.musicMatch.manual,
        matchedAt: new Date(),
      },
    });
    if (item.kind === "ASSESSED") {
      const verdict = toVerdict(item.assessment);
      await tx.rightsAssessment.upsert({
        where: { musicMatchId: match.id },
        create: { musicMatchId: match.id, ...verdict },
        update: { ...verdict, assessedAt: new Date() },
      });
    }
  } else if (item.kind === "NO_MUSIC_MATCH") {
    // "Identified, no track" is a match row with no track. The compound
    // unique key can't dedupe it (Postgres treats the null track ids as
    // distinct), so it's found first rather than upserted.
    const existing = await tx.musicMatch.findFirst({
      where: { commercialContentId: commercial.id, musicTrackId: null, provider: musicProviderName },
    });
    if (existing) {
      await tx.musicMatch.update({ where: { id: existing.id }, data: { matchedAt: new Date() } });
    } else {
      await tx.musicMatch.create({
        data: { commercialContentId: commercial.id, musicTrackId: null, provider: musicProviderName },
      });
    }
  }
  // MUSIC_ID_ERROR: the content is stored, and no match row at all is what
  // records that identification didn't complete.

  return contentRow.id;
}

/** The catalogue song an assessed item names — checked to be this
 *  workspace's, so an item can't be filed under another workspace's song. */
async function catalogueTrackId(tx: Prisma.TransactionClient, workspaceId: string, trackId: string): Promise<string> {
  const track = await tx.musicTrack.findFirst({ where: { id: trackId, workspaceId }, select: { id: true } });
  if (!track) throw new Error(`Track ${trackId} isn't in workspace ${workspaceId}.`);
  return track.id;
}

/** The workspace's record of a song outside its catalogue: the one it
 *  already knows, or a new one. */
async function recordIdentifiedTrack(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  match: NormalizedMusicMatch,
  known: KnownTrack[],
): Promise<string> {
  const isrc = normalizeIsrc(match.isrc);
  const existing = findSameTrack(known, { isrc, title: match.title, artist: match.artist || null });
  if (existing) return existing.id;
  const created = await tx.musicTrack.create({
    data: {
      workspaceId,
      title: match.title,
      artist: match.artist || null,
      isrc,
      source: "identified",
      inCatalogue: false,
    },
    select: { id: true, title: true, artist: true, isrc: true, externalId: true },
  });
  known.push(created);
  return created.id;
}

function toVerdict(assessment: RightsAssessmentResult) {
  return {
    status: assessment.status,
    reason: assessment.reason,
    explanation: assessment.explanation,
    matchedRecordIds: assessment.matchedRecordIds,
  };
}

function toContent(
  row: { platform: string; externalContentId: string; publishedAt: Date | null; createdAt: Date; creator: { externalId: string; handle: string } },
  commercial: { brandNames: string[]; label: string | null; videoUrls: string[]; territory: string | null; rawPayload: unknown },
): NormalizedCommercialContent {
  return {
    platform: row.platform as Platform,
    externalContentId: row.externalContentId,
    creatorExternalId: row.creator.externalId,
    creatorUsername: row.creator.handle,
    publishedAt: row.publishedAt ?? row.createdAt,
    brandNames: commercial.brandNames,
    label: commercial.label,
    videoUrls: commercial.videoUrls,
    territory: commercial.territory,
    rawPayload: commercial.rawPayload,
  };
}

function toMusicMatch(
  match: { confidence: number; provider: string; manual: boolean },
  track: { id: string; title: string; artist: string | null; isrc: string | null },
): NormalizedMusicMatch {
  return {
    trackId: track.id,
    title: track.title,
    artist: track.artist ?? "",
    isrc: track.isrc,
    confidence: match.confidence,
    provider: match.provider,
    manual: match.manual,
  };
}

function toStoredItems(rows: ContentRow[]): StoredScanItem[] {
  return rows.map(toStoredItem).filter((item): item is StoredScanItem => item !== null);
}

function toStoredItem(row: ContentRow): StoredScanItem | null {
  const commercial = row.commercialContent;
  if (!commercial) return null;

  const creator = {
    creatorId: row.creator.id,
    creatorExternalId: row.creator.externalId,
    creatorUsername: row.creator.handle,
  };
  const content = toContent(row, commercial);

  // Newest assessed identification wins: that's the one a Case hangs off.
  // An earlier one is never deleted, only outranked.
  const assessed = commercial.musicMatches.find((m) => m.musicTrack && m.rightsAssessment);
  if (assessed?.musicTrack && assessed.rightsAssessment) {
    const assessment = assessed.rightsAssessment;
    return {
      kind: "ASSESSED",
      content,
      musicMatch: toMusicMatch(assessed, assessed.musicTrack),
      assessment: {
        status: assessment.status as RightsAssessmentStatus,
        reason: assessment.reason as RightsAssessmentReason | null,
        matchedRecordIds: assessment.matchedRecordIds,
        explanation: assessment.explanation,
      },
      ...creator,
      rightsAssessmentId: assessment.id,
    };
  }

  const identified = commercial.musicMatches.find((m) => m.musicTrack);
  if (identified?.musicTrack) {
    return {
      kind: "OTHER_MUSIC",
      content,
      musicMatch: toMusicMatch(identified, identified.musicTrack),
      ...creator,
      rightsAssessmentId: null,
    };
  }

  if (commercial.musicMatches.some((m) => m.musicTrackId === null)) {
    return { kind: "NO_MUSIC_MATCH", content, ...creator, rightsAssessmentId: null };
  }
  return { kind: "MUSIC_ID_ERROR", content, error: IDENTIFICATION_NOT_COMPLETED, ...creator, rightsAssessmentId: null };
}
