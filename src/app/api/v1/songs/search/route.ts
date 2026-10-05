import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/app/_lib/current-user";
import { getLibraryStore } from "@/app/_lib/library-store";
import { spendRequest } from "@/app/_lib/request-limit";
import { searchSongs } from "@/app/_lib/song-search";
import { findSameTrack } from "@/modules/catalog";

/**
 * GET /api/v1/songs/search?q=… — finds songs to add to the Rights Library
 * (Brief §10, §45), each marked with whether it's already in the caller's
 * catalogue. Signed-in members only: it's the workspace's search box, not
 * a public proxy to the music database.
 *
 * Errors use one shape (Brief §45): `{ error: { code, message } }`, with a
 * message the search box can show as it is.
 */

const Query = z.object({
  q: z.string().trim().min(2, "Type at least two characters.").max(120, "Keep the search under 120 characters."),
});

export interface SongSearchApiResult {
  source: "musicbrainz" | "demo";
  externalId: string;
  title: string;
  artist: string;
  album: string | null;
  isrc: string | null;
  durationMs: number | null;
  releaseDate: string | null;
  artworkUrl: string | null;
  /** The catalogue song it is, when it's in the catalogue already. */
  catalogueTrackId: string | null;
}

function error(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest): Promise<Response> {
  const session = await getCurrentSession();
  if (!session) return error(401, "UNAUTHENTICATED", "Sign in to search songs.");

  // MusicBrainz asks for about one request a second from a client; a member typing fast
  // stays well inside this, a script looping the endpoint does not.
  const wait = spendRequest("song-search", session.user.id, { max: 40, windowMs: 60_000 });
  if (wait !== null) {
    const limited = error(429, "RATE_LIMITED", `Too many searches. Try again in ${wait} second${wait === 1 ? "" : "s"}.`);
    limited.headers.set("Retry-After", String(wait));
    return limited;
  }

  const parsed = Query.safeParse({ q: request.nextUrl.searchParams.get("q") ?? "" });
  if (!parsed.success) return error(400, "INVALID_QUERY", parsed.error.issues[0]?.message ?? "Enter a search.");

  const [response, catalogue] = await Promise.all([
    searchSongs(parsed.data.q),
    getLibraryStore().catalog.findCatalogue(session.workspace.id),
  ]);
  if (response.error) return error(503, "SEARCH_UNAVAILABLE", response.error);

  const results: SongSearchApiResult[] = response.results.map((song) => ({
    ...song,
    catalogueTrackId:
      findSameTrack(catalogue, { isrc: song.isrc, externalId: song.externalId, title: song.title, artist: song.artist })?.id ?? null,
  }));
  return Response.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
}
