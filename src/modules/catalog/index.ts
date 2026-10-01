export type {
  CatalogRepository,
  CatalogTrackChanges,
  CatalogTrackRecord,
  NewCatalogTrack,
  TrackIdentity,
  TrackSource,
} from "./types";
export { InMemoryCatalogRepository } from "./in-memory-repository";
// `PrismaCatalogRepository`: import from "@/modules/catalog/prisma-repository"
// — kept out of this barrel like every other module's Prisma repository.
export { addSong, removeSong, updateSongDetails, recordIdentifiedTrack, MAX_TITLE_LENGTH } from "./catalog";
export type {
  AddSongError,
  AddSongInput,
  AddSongResult,
  CatalogDependencies,
  RemoveSongResult,
  SongDetailsInput,
  UpdateSongDetailsResult,
} from "./catalog";
export { findSameTrack, isIsrc, looseName, normalizeIsrc, sameTrack } from "./identity";
