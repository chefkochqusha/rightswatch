import { findSameTrack, normalizeIsrc } from "./identity";
import type { CatalogRepository, CatalogTrackRecord, TrackSource } from "./types";

/**
 * Adding songs to the catalogue and taking them out (Brief §10). Scoped to
 * one workspace: another workspace's song is "not found", never touched.
 */

export interface CatalogDependencies {
  catalogRepository: CatalogRepository;
}

export interface AddSongInput {
  workspaceId: string;
  title: string;
  artist?: string | null;
  isrc?: string | null;
  album?: string | null;
  durationMs?: number | null;
  source: Exclude<TrackSource, "identified">;
  externalId?: string | null;
  artworkUrl?: string | null;
}

export type AddSongError = "TITLE_REQUIRED" | "ISRC_INVALID" | "ALREADY_IN_CATALOGUE";

export type AddSongResult =
  | {
      ok: true;
      track: CatalogTrackRecord;
      /** True when a scan had already identified this song in posts — the
       *  caller re-assesses those matches now that it's in the catalogue. */
      wasIdentified: boolean;
    }
  | { ok: false; error: AddSongError; track?: CatalogTrackRecord };

export const MAX_TITLE_LENGTH = 200;

export async function addSong(input: AddSongInput, deps: CatalogDependencies): Promise<AddSongResult> {
  const title = input.title.trim().slice(0, MAX_TITLE_LENGTH);
  if (!title) return { ok: false, error: "TITLE_REQUIRED" };
  const artist = input.artist?.trim() || null;

  let isrc: string | null = null;
  if (input.isrc?.trim()) {
    isrc = normalizeIsrc(input.isrc);
    if (!isrc) return { ok: false, error: "ISRC_INVALID" };
  }

  const known = await deps.catalogRepository.findAllKnown(input.workspaceId);
  const existing = findSameTrack(known, { isrc, externalId: input.externalId ?? null, title, artist });
  if (existing?.inCatalogue) return { ok: false, error: "ALREADY_IN_CATALOGUE", track: existing };

  const now = new Date();
  if (existing) {
    // Known from a scan, or removed earlier: bring it into the catalogue,
    // filling in what the earlier record didn't have. A song that was never
    // in the catalogue takes its source from how it's added now.
    const track = await deps.catalogRepository.update(existing.id, {
      inCatalogue: true,
      addedAt: now,
      source: existing.addedAt === null ? input.source : existing.source,
      isrc: existing.isrc ?? isrc,
      album: existing.album ?? input.album ?? null,
      durationMs: existing.durationMs ?? input.durationMs ?? null,
      externalId: existing.externalId ?? input.externalId ?? null,
      artworkUrl: existing.artworkUrl ?? input.artworkUrl ?? null,
    });
    return { ok: true, track, wasIdentified: true };
  }

  const track = await deps.catalogRepository.create({
    workspaceId: input.workspaceId,
    title,
    artist,
    isrc,
    album: input.album?.trim() || null,
    durationMs: input.durationMs ?? null,
    source: input.source,
    externalId: input.externalId ?? null,
    artworkUrl: input.artworkUrl ?? null,
    inCatalogue: true,
    addedAt: now,
  });
  return { ok: true, track, wasIdentified: false };
}

export type RemoveSongResult = { ok: true; track: CatalogTrackRecord } | { ok: false; error: "NOT_FOUND" };

/**
 * Takes a song out of the catalogue. Nothing is deleted: its rights
 * records, matches and cases stay, and adding it again brings them back.
 */
export async function removeSong(
  ref: { workspaceId: string; trackId: string },
  deps: CatalogDependencies,
): Promise<RemoveSongResult> {
  const track = await deps.catalogRepository.findById(ref.workspaceId, ref.trackId);
  if (!track || !track.inCatalogue) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, track: await deps.catalogRepository.update(track.id, { inCatalogue: false }) };
}

export interface SongDetailsInput {
  workspaceId: string;
  trackId: string;
  catalogueId?: string | null;
  rightsOwner?: string | null;
  publisher?: string | null;
  label?: string | null;
  notes?: string | null;
}

export type UpdateSongDetailsResult =
  | { ok: true; track: CatalogTrackRecord }
  | { ok: false; error: "NOT_FOUND" | "TOO_LONG" };

const MAX_DETAIL_LENGTH = 200;
const MAX_NOTES_LENGTH = 2000;

/** Brief §10's catalogue details for a song — catalogue ID, rights owner,
 *  publisher, label, notes. An empty field clears it. */
export async function updateSongDetails(input: SongDetailsInput, deps: CatalogDependencies): Promise<UpdateSongDetailsResult> {
  const track = await deps.catalogRepository.findById(input.workspaceId, input.trackId);
  if (!track) return { ok: false, error: "NOT_FOUND" };

  const clean = (value: string | null | undefined) => value?.trim() || null;
  const changes = {
    catalogueId: clean(input.catalogueId),
    rightsOwner: clean(input.rightsOwner),
    publisher: clean(input.publisher),
    label: clean(input.label),
    notes: clean(input.notes),
  };
  const { notes, ...short } = changes;
  if (Object.values(short).some((value) => value && value.length > MAX_DETAIL_LENGTH)) return { ok: false, error: "TOO_LONG" };
  if (notes && notes.length > MAX_NOTES_LENGTH) return { ok: false, error: "TOO_LONG" };

  return { ok: true, track: await deps.catalogRepository.update(track.id, changes) };
}

/**
 * The record of a song a scan identified in a post: the one the workspace
 * already knows (in the catalogue or not), or a new, uncatalogued one.
 * `findSameTrack` does the recognising, so a catalogue song identified by a
 * provider under a slightly different title still lands on it.
 */
export async function recordIdentifiedTrack(
  input: { workspaceId: string; title: string; artist: string | null; isrc: string | null },
  deps: CatalogDependencies,
): Promise<CatalogTrackRecord> {
  const known = await deps.catalogRepository.findAllKnown(input.workspaceId);
  const isrc = normalizeIsrc(input.isrc);
  const existing = findSameTrack(known, { isrc, title: input.title, artist: input.artist });
  if (existing) return existing;
  return deps.catalogRepository.create({
    workspaceId: input.workspaceId,
    title: input.title,
    artist: input.artist,
    isrc,
    album: null,
    durationMs: null,
    source: "identified",
    externalId: null,
    artworkUrl: null,
    inCatalogue: false,
    addedAt: null,
  });
}
