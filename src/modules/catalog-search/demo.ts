import { DEMO_TRACKS } from "../demo-data/catalog";
import { isIsrc, looseName, normalizeIsrc } from "../catalog/identity";
import type { SongSearchProvider, SongSearchResponse, SongSearchResult } from "./types";

/**
 * Song search over a fixed, fictional catalogue — for demo workspaces that
 * are told to use it (`MUSIC_SEARCH_PROVIDER=demo`), for tests, and for
 * development where the public music database isn't reachable. The six
 * songs Brief §62 names come first, so they're findable by name, then more
 * of the same kind. Every ISRC uses the made-up registrant "DEMO".
 */

const MORE_SONGS: [title: string, artist: string, album: string, year: string][] = [
  ["Paper Planes", "Juno Vale", "Altitude", "2024"],
  ["Northern Lines", "Halden", "Northern Lines", "2025"],
  ["Slow Motion", "Kova", "Static Bloom", "2026"],
  ["Weightless", "Mira", "Afterglow", "2025"],
  ["Coastline", "Riva", "Golden Hour", "2026"],
  ["Night Shift", "Aiko", "Midnight Run", "2026"],
  ["Echoes", "Nova", "Still Here", "2025"],
  ["Polaroid", "Sable Reyes", "Developing", "2023"],
  ["Run It Back", "The Marlowes", "Second Take", "2024"],
  ["Concrete Garden", "Ivy Lane", "City Flora", "2025"],
  ["Morning Static", "Ellis Grey", "Low Light", "2022"],
  ["Gravity", "Juno Vale", "Altitude", "2024"],
  ["Lanterns", "Halden", "Northern Lines", "2025"],
  ["Overtime", "Kaïro", "Shiftwork", "2026"],
  ["Daydream Drive", "The Marlowes", "Second Take", "2024"],
  ["Silver Lining", "Wilder Sun", "Bright Side", "2023"],
  ["Heatwave", "Riva", "Golden Hour", "2026"],
  ["Firefly", "Nova", "Still Here", "2025"],
];

function demoIsrc(index: number): string {
  return `DEMO12610${String(index + 1).padStart(3, "0")}`;
}

export const DEMO_SEARCH_CATALOGUE: readonly SongSearchResult[] = [
  ...Object.values(DEMO_TRACKS).map((track) => ({
    source: "demo" as const,
    externalId: track.trackId,
    title: track.title,
    artist: track.artist,
    album: null,
    isrc: track.isrc,
    durationMs: null,
    releaseDate: "2026",
    artworkUrl: null,
  })),
  ...MORE_SONGS.map(([title, artist, album, year], index) => ({
    source: "demo" as const,
    externalId: `demo-search-${index + 1}`,
    title,
    artist,
    album,
    isrc: demoIsrc(index),
    durationMs: 150_000 + ((index * 7919) % 90_000),
    releaseDate: year,
    artworkUrl: null,
  })),
];

export class DemoSongSearch implements SongSearchProvider {
  readonly name = "demo" as const;

  async search(query: string, options: { limit?: number } = {}): Promise<SongSearchResponse> {
    const limit = options.limit ?? 12;
    const text = query.trim();
    if (text.length < 2) return { results: [], error: null };

    if (isIsrc(text)) {
      const isrc = normalizeIsrc(text);
      return { results: DEMO_SEARCH_CATALOGUE.filter((song) => song.isrc === isrc).slice(0, limit), error: null };
    }

    // Every word has to appear in the title, artist or album.
    const words = looseName(text).split(" ").filter(Boolean);
    const results = DEMO_SEARCH_CATALOGUE.filter((song) => {
      const haystack = `${looseName(song.title)} ${looseName(song.artist)} ${looseName(song.album)}`;
      return words.every((word) => haystack.includes(word));
    });
    return { results: results.slice(0, limit), error: null };
  }
}
