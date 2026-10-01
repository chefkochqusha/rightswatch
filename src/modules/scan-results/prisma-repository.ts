import { getPrisma } from "@/lib/prisma-client";
import type { Prisma } from "@/generated/prisma/client";
import type { NormalizedCommercialContent, Platform } from "../connectors/types";
import type { NormalizedMusicMatch } from "../music/types";
import type { RightsAssessmentReason, RightsAssessmentStatus } from "../rights-engine/types";
import { IDENTIFICATION_NOT_COMPLETED } from "./types";
import type { ScanItemInput, ScanResultRepository, StoredScanItem } from "./types";

/**
 * Scan results in Postgres (see `types.ts` for the chain and the contract).
 * Each item's chain is written in its own transaction — Creator, Content and
 * CommercialContent always; then the MusicTrack, MusicMatch and
 * RightsAssessment an identification produced — upserted on the schema's own
 * unique keys, so saving a scan twice touches the same rows (Brief §22).
 *
 * Tracks: a workspace's `MusicTrack` for an identification is found by ISRC
 * when the provider gives one, otherwise by title and artist, and created
 * only when there isn't one yet.
 *
 * `getPrisma()`, never a top-level `prisma` binding — see
 * `src/lib/prisma-client.ts`.
 */

const CONTENT_INCLUDE = {
  creator: true,
  commercialContent: {
    include: {
      musicMatches: {
        include: { musicTrack: true, rightsAssessment: true },
        orderBy: { matchedAt: "desc" },
      },
    },
  },
} satisfies Prisma.ContentInclude;

type ContentRow = Prisma.ContentGetPayload<{ include: typeof CONTENT_INCLUDE }>;

export class PrismaScanResultRepository implements ScanResultRepository {
  async saveScan(input: {
    workspaceId: string;
    musicProviderName: string;
    items: ScanItemInput[];
  }): Promise<StoredScanItem[]> {
    const stored: StoredScanItem[] = [];
    for (const item of input.items) {
      const contentRowId = await getPrisma().$transaction((tx) =>
        writeItem(tx, input.workspaceId, input.musicProviderName, item),
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
    return rows.map(toStoredItem).filter((item): item is StoredScanItem => item !== null);
  }

  async findForCreator(workspaceId: string, creatorId: string): Promise<StoredScanItem[]> {
    const rows = await getPrisma().content.findMany({
      where: { creatorId, creator: { workspaceId } },
      include: CONTENT_INCLUDE,
      orderBy: { publishedAt: "desc" },
    });
    return rows.map(toStoredItem).filter((item): item is StoredScanItem => item !== null);
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
}

async function writeItem(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  musicProviderName: string,
  item: ScanItemInput,
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

  if (item.kind === "ASSESSED") {
    const track = await findOrCreateTrack(tx, workspaceId, item.musicMatch);
    const match = await tx.musicMatch.upsert({
      where: {
        commercialContentId_musicTrackId_provider: {
          commercialContentId: commercial.id,
          musicTrackId: track.id,
          provider: item.musicMatch.provider,
        },
      },
      create: {
        commercialContentId: commercial.id,
        musicTrackId: track.id,
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
    const verdict = {
      status: item.assessment.status,
      reason: item.assessment.reason,
      explanation: item.assessment.explanation,
      matchedRecordIds: item.assessment.matchedRecordIds,
    };
    await tx.rightsAssessment.upsert({
      where: { musicMatchId: match.id },
      create: { musicMatchId: match.id, ...verdict },
      update: { ...verdict, assessedAt: new Date() },
    });
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

async function findOrCreateTrack(tx: Prisma.TransactionClient, workspaceId: string, match: NormalizedMusicMatch) {
  const existing = await tx.musicTrack.findFirst({
    where: match.isrc
      ? { workspaceId, isrc: match.isrc }
      : { workspaceId, isrc: null, title: match.title, artist: match.artist },
    orderBy: { createdAt: "asc" },
  });
  return (
    existing ??
    tx.musicTrack.create({
      data: { workspaceId, title: match.title, artist: match.artist, isrc: match.isrc },
    })
  );
}

function toStoredItem(row: ContentRow): StoredScanItem | null {
  const commercial = row.commercialContent;
  if (!commercial) return null;

  const creator = {
    creatorId: row.creator.id,
    creatorExternalId: row.creator.externalId,
    creatorUsername: row.creator.handle,
  };
  const content: NormalizedCommercialContent = {
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

  // Newest identification with a track wins: that's the one a Case hangs
  // off. An earlier one is never deleted, only outranked.
  const identified = commercial.musicMatches.find((m) => m.musicTrack && m.rightsAssessment);
  if (identified?.musicTrack && identified.rightsAssessment) {
    const assessment = identified.rightsAssessment;
    return {
      kind: "ASSESSED",
      content,
      musicMatch: {
        trackId: identified.musicTrack.id,
        title: identified.musicTrack.title,
        artist: identified.musicTrack.artist ?? "",
        isrc: identified.musicTrack.isrc,
        confidence: identified.confidence,
        provider: identified.provider,
        manual: identified.manual,
      },
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

  if (commercial.musicMatches.some((m) => m.musicTrackId === null)) {
    return { kind: "NO_MUSIC_MATCH", content, ...creator, rightsAssessmentId: null };
  }
  return { kind: "MUSIC_ID_ERROR", content, error: IDENTIFICATION_NOT_COMPLETED, ...creator, rightsAssessmentId: null };
}
