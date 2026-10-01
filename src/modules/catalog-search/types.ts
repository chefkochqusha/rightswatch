/**
 * Finding a song to add to the catalogue by searching for it, the way a
 * music app's search works (Brief §10's Rights Library starts from the
 * songs; the user asked for "search like Spotify"). One interface, several
 * providers: a public music database in production, a fixed fictional
 * catalogue for demo, tests and offline development — chosen by the
 * environment (`MUSIC_SEARCH_PROVIDER`), never by the code that searches.
 */

export interface SongSearchResult {
  /** Which provider found it — becomes the song's `source`. */
  source: "musicbrainz" | "demo";
  /** The provider's own id for the recording. */
  externalId: string;
  title: string;
  artist: string;
  album: string | null;
  isrc: string | null;
  durationMs: number | null;
  /** "2019", "2019-11", "2019-11-29" — as precise as the provider knows. */
  releaseDate: string | null;
  artworkUrl: string | null;
}

export interface SongSearchResponse {
  results: SongSearchResult[];
  /** Set when the search itself couldn't run (the provider is down or
   *  busy) — distinct from "nothing found", which is an empty list. */
  error: string | null;
}

export interface SongSearchProvider {
  readonly name: SongSearchResult["source"];
  search(query: string, options?: { limit?: number }): Promise<SongSearchResponse>;
}
