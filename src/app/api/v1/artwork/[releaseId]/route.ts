import type { NextRequest } from "next/server";
import { clientIpFrom, spendRequest } from "@/app/_lib/request-limit";

/**
 * GET /api/v1/artwork/{releaseId} — a song's cover art, fetched from the
 * Cover Art Archive (where MusicBrainz search results point) by this
 * server rather than by the browser, so viewing the catalogue doesn't
 * hand every member's IP address to a third party (Brief §59: privacy by
 * design). Only a MusicBrainz release id is accepted — this is not a
 * general-purpose image proxy — and the image is cached for a year: a
 * release's front cover doesn't change.
 *
 * Public, like any image: a cover is the record's own artwork, not
 * workspace data, and caching it at the edge needs a response that's the
 * same for everyone.
 */

const RELEASE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Raster images only: an SVG served from this origin could carry script.
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 2_000_000;

export async function GET(request: NextRequest, ctx: RouteContext<"/api/v1/artwork/[releaseId]">): Promise<Response> {
  const { releaseId } = await ctx.params;
  if (!RELEASE_ID.test(releaseId)) return new Response("Not found", { status: 404 });

  // Only requests that reach this server count: a cover already in the edge cache never gets here.
  const wait = spendRequest("artwork", clientIpFrom(request.headers), { max: 120, windowMs: 60_000 });
  if (wait !== null) return new Response("Too many requests.", { status: 429, headers: { "Retry-After": String(wait), "Cache-Control": "no-store" } });

  let upstream: Response;
  try {
    upstream = await fetch(`https://coverartarchive.org/release/${releaseId}/front-250`, {
      headers: { "User-Agent": "RightsWatch/0.1 ( https://rightswatch.vercel.app )" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return new Response("Cover art isn't reachable right now.", { status: 504, headers: { "Cache-Control": "no-store" } });
  }

  const type = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!upstream.ok || !IMAGE_TYPES.has(type)) {
    // No cover for this release: remember that briefly, not forever.
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
  }
  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new Response("Not found", { status: 404 });

  return new Response(body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
