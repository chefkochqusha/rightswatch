import type { TrackIdentity } from "./types";

/**
 * Telling whether two descriptions are the same song. An ISRC is the
 * recording's own id, so it decides when both sides have one; a source id
 * (a MusicBrainz recording id) decides next; otherwise title and artist,
 * compared loosely — case, accents, punctuation and "feat." credits vary
 * between sources for the same recording.
 */

const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

/** "us-um7-19-00001", "USUM71900001" and " usum71900001 " are all
 *  "USUM71900001"; anything that isn't an ISRC is `null`. */
export function normalizeIsrc(input: string | null | undefined): string | null {
  if (!input) return null;
  const value = input.replace(/[\s-]/g, "").toUpperCase();
  return ISRC_PATTERN.test(value) ? value : null;
}

export function isIsrc(input: string): boolean {
  return normalizeIsrc(input) !== null;
}

/** Lowercase, no accents, no punctuation, no "(feat. …)" — what's left of
 *  a title or artist name that two catalogues would agree on. */
export function looseName(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[([](?:feat|ft|featuring|with)\.?[^)\]]*[)\]]/g, " ")
    .replace(/\s(?:feat|ft|featuring)\.?\s.*$/, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sameTrack(a: TrackIdentity, b: TrackIdentity): boolean {
  const isrcA = normalizeIsrc(a.isrc);
  const isrcB = normalizeIsrc(b.isrc);
  if (isrcA && isrcB) return isrcA === isrcB;
  if (a.externalId && b.externalId) return a.externalId === b.externalId;
  return looseName(a.title) === looseName(b.title) && looseName(a.artist) === looseName(b.artist);
}

/** The first of `known` that is the same song as `wanted`, preferring an
 *  ISRC match over a name match. */
export function findSameTrack<T extends TrackIdentity>(known: readonly T[], wanted: TrackIdentity): T | null {
  const isrc = normalizeIsrc(wanted.isrc);
  if (isrc) {
    const byIsrc = known.find((track) => normalizeIsrc(track.isrc) === isrc);
    if (byIsrc) return byIsrc;
  }
  return known.find((track) => sameTrack(track, wanted)) ?? null;
}
