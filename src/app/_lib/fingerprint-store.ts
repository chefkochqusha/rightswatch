import { getPrisma } from "@/lib/prisma-client";
import type { IndexTrack } from "@/modules/recognition";

/**
 * Catalogue songs' fingerprints (`TrackFingerprint`), in Postgres. Only
 * songs in the catalogue are searched: a song taken out of it keeps its
 * fingerprint (adding it back needs no new upload) but isn't looked for.
 */

export interface FingerprintSummary {
  durationSec: number;
  sourceFileName: string | null;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Whether the fingerprint carries the melody line (format `bekvor-lp-1+mel1`,
   * the second check). Older ones still match, but their songs can only be
   * suggested, never recognised on their own, until the recording is uploaded again.
   */
  hasMelody: boolean;
}

/** The format name a fingerprint's bytes start with (`services/recognizer/bekvor_fp.py`). */
export const MELODY_FORMAT_PREFIX = "bekvor-lp-1+mel1\n";

export async function findFingerprintSummary(workspaceId: string, trackId: string): Promise<FingerprintSummary | null> {
  // Only the first bytes are compared, in the database: a fingerprint can be hundreds of kilobytes.
  const rows = await getPrisma().$queryRaw<FingerprintSummary[]>`
    SELECT "durationSec", "sourceFileName", "createdAt", "updatedAt",
           substring("data" from 1 for ${MELODY_FORMAT_PREFIX.length}) = convert_to(${MELODY_FORMAT_PREFIX}, 'UTF8') AS "hasMelody"
    FROM "track_fingerprints"
    WHERE "workspaceId" = ${workspaceId} AND "musicTrackId" = ${trackId}
    LIMIT 1`;
  return rows[0] ?? null;
}

/** Track ids with a fingerprint, among these. */
export async function fingerprintedTrackIds(workspaceId: string): Promise<Set<string>> {
  const rows = await getPrisma().trackFingerprint.findMany({ where: { workspaceId }, select: { musicTrackId: true } });
  return new Set(rows.map((row) => row.musicTrackId));
}

/** What the index is made of: catalogue songs with a fingerprint. */
export async function indexTracks(workspaceId: string): Promise<IndexTrack[]> {
  const rows = await getPrisma().trackFingerprint.findMany({
    where: { workspaceId, musicTrack: { inCatalogue: true } },
    select: { musicTrackId: true, updatedAt: true },
  });
  return rows.map((row) => ({ trackId: row.musicTrackId, fingerprintUpdatedAt: row.updatedAt }));
}

export async function indexData(workspaceId: string, trackIds: readonly string[]): Promise<{ trackId: string; fingerprint: Uint8Array }[]> {
  const rows = await getPrisma().trackFingerprint.findMany({
    where: { workspaceId, musicTrackId: { in: [...trackIds] } },
    select: { musicTrackId: true, data: true },
  });
  return rows.map((row) => ({ trackId: row.musicTrackId, fingerprint: row.data }));
}

export async function saveFingerprint(input: {
  workspaceId: string;
  trackId: string;
  algorithm: string;
  data: Uint8Array;
  durationSec: number;
  hashCount: number;
  sourceFileName: string | null;
  sourceSha256: string;
  createdById: string | null;
}): Promise<void> {
  const fields = {
    algorithm: input.algorithm,
    data: Buffer.from(input.data),
    durationSec: input.durationSec,
    hashCount: input.hashCount,
    sourceFileName: input.sourceFileName,
    sourceSha256: input.sourceSha256,
    createdById: input.createdById,
  };
  await getPrisma().trackFingerprint.upsert({
    where: { musicTrackId: input.trackId },
    create: { workspaceId: input.workspaceId, musicTrackId: input.trackId, ...fields },
    update: fields,
  });
}

export async function deleteFingerprint(workspaceId: string, trackId: string): Promise<boolean> {
  const { count } = await getPrisma().trackFingerprint.deleteMany({ where: { workspaceId, musicTrackId: trackId } });
  return count > 0;
}
