import { isIsrc, looseName, normalizeIsrc } from "../catalog/identity";
import type { SongSearchProvider, SongSearchResponse, SongSearchResult } from "./types";

/**
 * Song search against MusicBrainz's public web service — an open music
 * database whose core data is public domain (CC0), with no API key. Its
 * terms ask for a User-Agent that names the application and a way to reach
 * its maintainers, and at most about one request per second per IP
 * (busier gets HTTP 503); callers debounce and cache accordingly. Cover art
 * comes from the Cover Art Archive by release id, and a release without
 * any simply shows no image.
 *
 * A query that is an ISRC searches by ISRC; anything else is free text,
 * matched against titles, artists and releases.
 */

const ENDPOINT = "https://musicbrainz.org/ws/2/recording";
const USER_AGENT = "RightsWatch/0.1 ( https://rightswatch.vercel.app )";
const TIMEOUT_MS = 6_000;

// The JSON shape of a recording search result — only what's read here.
interface MusicBrainzRecording {
  id: string;
  title: string;
  length?: number | null;
  video?: boolean | null;
  "artist-credit"?: { name: string; joinphrase?: string }[];
  "first-release-date"?: string;
  releases?: {
    id: string;
    title: string;
    date?: string;
    status?: string;
    "release-group"?: { "primary-type"?: string; "secondary-types"?: string[] };
  }[];
  isrcs?: string[];
}

export class MusicBrainzSongSearch implements SongSearchProvider {
  readonly name = "musicbrainz" as const;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { fetch?: typeof fetch } = {}) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  async search(query: string, options: { limit?: number } = {}): Promise<SongSearchResponse> {
    const text = query.trim();
    if (text.length < 2) return { results: [], error: null };
    const limit = Math.min(Math.max(options.limit ?? 12, 1), 25);

    const lucene = isIsrc(text) ? `isrc:${normalizeIsrc(text)}` : escapeLucene(text);
    // Ask for more than shown: alternate versions of one song collapse below.
    const url = `${ENDPOINT}?query=${encodeURIComponent(lucene)}&fmt=json&limit=${Math.min(limit * 2, 50)}`;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { results: [], error: "Song search isn't reachable right now. Try again, or add the song by hand." };
    }
    if (response.status === 503) {
      return { results: [], error: "Song search is busy. Try again in a moment." };
    }
    if (!response.ok) {
      return { results: [], error: "Song search isn't available right now. Try again, or add the song by hand." };
    }

    const body = (await response.json().catch(() => null)) as { recordings?: MusicBrainzRecording[] } | null;
    return { results: toResults(body?.recordings ?? []).slice(0, limit), error: null };
  }
}

/** Free text as a plain query: Lucene's operators escaped, so "AC/DC" or
 *  "Don't Stop (Remix)" search for what they say. */
export function escapeLucene(text: string): string {
  return text.replace(/[+\-!(){}[\]^"~*?:\\/]|&&|\|\|/g, (match) => `\\${match}`);
}

export function toResults(recordings: MusicBrainzRecording[]): SongSearchResult[] {
  const results: SongSearchResult[] = [];
  const seen = new Set<string>();
  for (const recording of recordings) {
    if (recording.video) continue;
    const artist = (recording["artist-credit"] ?? []).map((credit) => `${credit.name}${credit.joinphrase ?? ""}`).join("").trim();
    const isrc = normalizeIsrc(recording.isrcs?.[0]);
    // One line per song: the same title and artist (and ISRC, if known) from
    // another release of it adds nothing a person choosing would need.
    const key = `${looseName(recording.title)}|${looseName(artist)}|${isrc ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const release = pickRelease(recording.releases ?? []);
    results.push({
      source: "musicbrainz",
      externalId: recording.id,
      title: recording.title,
      artist,
      album: release?.title ?? null,
      isrc,
      durationMs: typeof recording.length === "number" ? recording.length : null,
      releaseDate: recording["first-release-date"] ?? release?.date ?? null,
      artworkUrl: release ? `https://coverartarchive.org/release/${release.id}/front-250` : null,
    });
  }
  return results;
}

/** The release a person would name the song by: an official album or
 *  single over a compilation, the earliest first. */
function pickRelease(releases: NonNullable<MusicBrainzRecording["releases"]>) {
  const rank = (release: (typeof releases)[number]) => {
    const group = release["release-group"];
    let score = 0;
    if (release.status !== "Official") score += 4;
    if ((group?.["secondary-types"] ?? []).length > 0) score += 2;
    if (group?.["primary-type"] !== "Album" && group?.["primary-type"] !== "Single") score += 1;
    return score;
  };
  return (
    [...releases].sort((a, b) => rank(a) - rank(b) || (a.date ?? "9999").localeCompare(b.date ?? "9999"))[0] ?? null
  );
}
