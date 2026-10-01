import { DemoSongSearch, MusicBrainzSongSearch, type SongSearchProvider, type SongSearchResponse } from "@/modules/catalog-search";

/**
 * Song search for the Rights Library (`modules/catalog-search`): which
 * provider answers, and the manners it needs.
 *
 * - **Provider**: `MUSIC_SEARCH_PROVIDER` — "musicbrainz" (the default:
 *   the open music database, no key) or "demo" (the fixed, fictional
 *   catalogue, for tests and offline development). Nothing else in the
 *   app knows which one answered.
 * - **Caching**: the same query within ten minutes is answered from
 *   memory — a person refining a search goes back and forth, and the
 *   public service asks callers not to repeat themselves.
 * - **Pace**: MusicBrainz allows about one request per second per client.
 *   Requests from this server process queue behind each other at that
 *   pace; one that would wait more than a few seconds is answered "busy"
 *   instead, which the search box shows as such.
 */

const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 300;
const MIN_INTERVAL_MS = 1_100;
const MAX_WAIT_MS = 3_500;

interface SearchState {
  provider: SongSearchProvider;
  cache: Map<string, { at: number; response: SongSearchResponse }>;
  nextSlotAt: number;
}

const globalForSearch = globalThis as unknown as { __rightswatchSongSearch?: SearchState };

function state(): SearchState {
  if (!globalForSearch.__rightswatchSongSearch) {
    const name = process.env.MUSIC_SEARCH_PROVIDER?.trim().toLowerCase();
    globalForSearch.__rightswatchSongSearch = {
      provider: name === "demo" ? new DemoSongSearch() : new MusicBrainzSongSearch(),
      cache: new Map(),
      nextSlotAt: 0,
    };
  }
  return globalForSearch.__rightswatchSongSearch;
}

export function songSearchProviderName(): SongSearchProvider["name"] {
  return state().provider.name;
}

export async function searchSongs(query: string): Promise<SongSearchResponse> {
  const search = state();
  const key = query.trim().toLowerCase().replace(/\s+/g, " ");

  const cached = search.cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.response;

  if (search.provider.name === "musicbrainz") {
    const now = Date.now();
    const slot = Math.max(now, search.nextSlotAt);
    if (slot - now > MAX_WAIT_MS) return { results: [], error: "Song search is busy. Try again in a moment." };
    search.nextSlotAt = slot + MIN_INTERVAL_MS;
    if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
  }

  const response = await search.provider.search(key, { limit: 12 });
  if (!response.error) {
    search.cache.set(key, { at: Date.now(), response });
    // Oldest out first: a Map keeps insertion order.
    while (search.cache.size > CACHE_MAX_ENTRIES) search.cache.delete(search.cache.keys().next().value!);
  }
  return response;
}
