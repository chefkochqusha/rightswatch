/**
 * The song catalogue (Master Brief §10, the Rights Library's tracks): the
 * songs a workspace administers, which scans assess commercial posts
 * against. Field names mirror `prisma/schema.prisma`'s `MusicTrack`.
 *
 * A workspace also knows songs it doesn't administer: a scan records every
 * track it identifies, in the catalogue or not (`inCatalogue` false,
 * `source` "identified"). Adding one of those to the catalogue later
 * brings its earlier matches with it.
 */

export type TrackSource = "musicbrainz" | "manual" | "demo" | "identified";

export interface CatalogTrackRecord {
  id: string;
  workspaceId: string;
  title: string;
  artist: string | null;
  isrc: string | null;
  album: string | null;
  durationMs: number | null;
  catalogueId: string | null;
  rightsOwner: string | null;
  publisher: string | null;
  label: string | null;
  notes: string | null;
  source: TrackSource;
  /** The source's own id — a MusicBrainz recording id. */
  externalId: string | null;
  artworkUrl: string | null;
  inCatalogue: boolean;
  /** When it joined the catalogue. */
  addedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewCatalogTrack {
  workspaceId: string;
  title: string;
  artist: string | null;
  isrc: string | null;
  album: string | null;
  durationMs: number | null;
  source: TrackSource;
  externalId: string | null;
  artworkUrl: string | null;
  inCatalogue: boolean;
  addedAt: Date | null;
}

export type CatalogTrackChanges = Partial<
  Pick<
    CatalogTrackRecord,
    | "title"
    | "artist"
    | "isrc"
    | "album"
    | "durationMs"
    | "catalogueId"
    | "rightsOwner"
    | "publisher"
    | "label"
    | "notes"
    | "source"
    | "externalId"
    | "artworkUrl"
    | "inCatalogue"
    | "addedAt"
  >
>;

/** How a song is recognised as one the workspace already knows. */
export interface TrackIdentity {
  isrc: string | null;
  externalId?: string | null;
  title: string;
  artist: string | null;
}

export interface CatalogRepository {
  /** The catalogue: songs in it, most recently added first. */
  findCatalogue(workspaceId: string): Promise<CatalogTrackRecord[]>;
  /** Scoped by workspace, in the catalogue or not. */
  findById(workspaceId: string, id: string): Promise<CatalogTrackRecord | null>;
  /** Every song the workspace knows, in the catalogue or not — what
   *  `findSameTrack` (`identity.ts`) picks from. */
  findAllKnown(workspaceId: string): Promise<CatalogTrackRecord[]>;
  create(input: NewCatalogTrack): Promise<CatalogTrackRecord>;
  update(id: string, changes: CatalogTrackChanges): Promise<CatalogTrackRecord>;
}
