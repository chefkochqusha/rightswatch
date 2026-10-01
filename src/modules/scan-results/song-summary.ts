import type { StoredScanItem } from "./types";

/** What the scans found for one song, across every watched creator. */
export interface SongMatchSummary {
  trackId: string;
  /** Posts the song was identified in. */
  posts: number;
  /** Different creators those posts belong to. */
  creators: number;
  /** Posts by verdict. `other` is a post with the song but no verdict, because the song isn't in the library. */
  potentialMismatch: number;
  review: number;
  unknown: number;
  cleared: number;
  other: number;
  /** The newest post's publish date. */
  lastPostAt: Date;
}

/**
 * Groups identified posts by song, the songs most in need of a look first:
 * most potential mismatches, then most posts waiting on a person, then
 * most posts overall, then the freshest. Posts with no song are left out.
 */
export function summarizeSongMatches(items: readonly StoredScanItem[]): SongMatchSummary[] {
  const byTrack = new Map<string, SongMatchSummary & { creatorIds: Set<string> }>();

  for (const item of items) {
    if (item.kind !== "ASSESSED" && item.kind !== "OTHER_MUSIC") continue;
    const trackId = item.musicMatch.trackId;
    if (!trackId) continue;

    let entry = byTrack.get(trackId);
    if (!entry) {
      entry = { trackId, posts: 0, creators: 0, potentialMismatch: 0, review: 0, unknown: 0, cleared: 0, other: 0, lastPostAt: item.content.publishedAt, creatorIds: new Set() };
      byTrack.set(trackId, entry);
    }
    entry.posts += 1;
    entry.creatorIds.add(item.creatorId);
    if (item.content.publishedAt > entry.lastPostAt) entry.lastPostAt = item.content.publishedAt;

    if (item.kind === "OTHER_MUSIC") entry.other += 1;
    else if (item.assessment.status === "POTENTIAL_MISMATCH") entry.potentialMismatch += 1;
    else if (item.assessment.status === "REVIEW") entry.review += 1;
    else if (item.assessment.status === "UNKNOWN") entry.unknown += 1;
    else entry.cleared += 1;
  }

  return [...byTrack.values()]
    .map(({ creatorIds, ...summary }) => ({ ...summary, creators: creatorIds.size }))
    .sort(
      (a, b) =>
        b.potentialMismatch - a.potentialMismatch ||
        b.review + b.unknown - (a.review + a.unknown) ||
        b.posts - a.posts ||
        b.lastPostAt.getTime() - a.lastPostAt.getTime(),
    );
}
