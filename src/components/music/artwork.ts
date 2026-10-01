/**
 * Cover art for songs (and, through them, the posters standing in for the
 * videos that use them). A song from the music database shows its release's
 * real cover, fetched through this app's own server
 * (`/api/v1/artwork/{releaseId}`); every other song — added by hand, the
 * demo catalogue's fictional ones, or a real one without a cover — gets a
 * generated cover instead: a palette and a motif drawn from its title and
 * artist, so the same song always looks the same, everywhere, and two
 * songs rarely look alike.
 *
 * Kept free of React so it can be tested on its own.
 */

/** Background, foreground and accent. Muted, printed-sleeve colors. */
export const COVER_PALETTES: readonly (readonly [string, string, string])[] = [
  ["#1f3a5f", "#f2c14e", "#e8eef5"],
  ["#2e2a24", "#e8d5b5", "#b0895c"],
  ["#0f4c45", "#9ad1c3", "#f1f7f4"],
  ["#5b2333", "#f7c1bb", "#e9dcd9"],
  ["#e9e4da", "#2b2b2b", "#b5523b"],
  ["#3a3f8f", "#c9ccff", "#f3f3ff"],
  ["#b8432f", "#fbe3d3", "#2a1b16"],
  ["#202124", "#b9c2cc", "#7f8c99"],
  ["#6b4e16", "#f4d58d", "#fff6dd"],
  ["#23395b", "#8ea8c3", "#dfe8f1"],
  ["#d8e2dc", "#1b4332", "#74a57f"],
  ["#40263a", "#e0a96d", "#f6e7d8"],
];

export type CoverMotif = "rings" | "bars" | "orbit" | "stripes" | "monogram" | "wave";
const MOTIFS: readonly CoverMotif[] = ["rings", "bars", "orbit", "stripes", "monogram", "wave"];

export interface GeneratedCover {
  background: string;
  foreground: string;
  accent: string;
  motif: CoverMotif;
  /** A per-song number in [0, 1) the motif uses for its proportions. */
  variation: number;
  /** For the monogram motif. */
  initial: string;
}

/** FNV-1a — the same song name always hashes the same. */
function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

export function generatedCover(title: string, artist: string | null): GeneratedCover {
  const key = `${title.trim().toLowerCase()}|${(artist ?? "").trim().toLowerCase()}`;
  const h = hash(key);
  const [background, foreground, accent] = COVER_PALETTES[h % COVER_PALETTES.length];
  const initial = (title.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "♪").toUpperCase();
  return {
    background,
    foreground,
    accent,
    motif: MOTIFS[(h >>> 8) % MOTIFS.length],
    variation: ((h >>> 16) % 1000) / 1000,
    initial,
  };
}

const CAA_RELEASE = /^https:\/\/coverartarchive\.org\/release\/([0-9a-f-]{36})\/front-\d+$/;

/** Where the browser loads a song's real cover from — this app's own
 *  artwork route — or `null` when there's no real cover to load. */
export function artworkSrc(artworkUrl: string | null | undefined): string | null {
  const releaseId = artworkUrl ? CAA_RELEASE.exec(artworkUrl)?.[1] : undefined;
  return releaseId ? `/api/v1/artwork/${releaseId}` : null;
}
