import type { RightsAssessmentStatus } from "@/modules/rights-engine/types";

/**
 * What the landing page shows as examples: real songs, with made-up posts.
 *
 * - **Songs** are real, well-known compositions whose composers died more
 *   than 70 years ago, so the works are in the public domain in the EU
 *   (§ 64 UrhG) and naming them needs nobody's permission. No recording is
 *   played or named: a verdict in an example is about a fictional licence
 *   for a recording, never about the composition. These pieces are also
 *   what creators really put under paid posts.
 * - **Creators, brands, captions and licence records are made up** (Brief
 *   §62's cast), and the page says so under every example. No real
 *   account, brand or person is shown next to a verdict.
 * - Songs by living artists or under a label (a current hit, a customer's
 *   catalogue) only go here with the written permission of the artist and
 *   the rights holders: name, title and cover each need it, and a verdict
 *   next to a real artist must not suggest they work with Bekvor
 *   (`RELEASE_CHECKLIST.md`, "Real songs on the website").
 */

export interface ShowcaseSong {
  title: string;
  composer: string;
  /** Short form for tight spots ("Debussy"). */
  short: string;
  /** Year the composer died, for the public-domain check above. */
  died: number;
}

export const SONGS = {
  clairDeLune: { title: "Clair de Lune", composer: "Claude Debussy", short: "Debussy", died: 1918 },
  reverie: { title: "Rêverie", composer: "Claude Debussy", short: "Debussy", died: 1918 },
  gymnopedie: { title: "Gymnopédie No. 1", composer: "Erik Satie", short: "Satie", died: 1925 },
  furElise: { title: "Für Elise", composer: "Ludwig van Beethoven", short: "Beethoven", died: 1827 },
  spring: { title: "Spring", composer: "Antonio Vivaldi", short: "Vivaldi", died: 1741 },
  nocturne: { title: "Nocturne Op. 9 No. 2", composer: "Frédéric Chopin", short: "Chopin", died: 1849 },
  mountainKing: { title: "In the Hall of the Mountain King", composer: "Edvard Grieg", short: "Grieg", died: 1907 },
  sugarPlum: { title: "Dance of the Sugar Plum Fairy", composer: "Pyotr Tchaikovsky", short: "Tchaikovsky", died: 1893 },
  canon: { title: "Canon in D", composer: "Johann Pachelbel", short: "Pachelbel", died: 1706 },
  air: { title: "Air on the G String", composer: "Johann Sebastian Bach", short: "Bach", died: 1750 },
} as const satisfies Record<string, ShowcaseSong>;

export type ShowcaseSongKey = keyof typeof SONGS;

/** The picture a made-up post shows: a product on a softly lit set. */
export interface Scene {
  /** The product, as an emoji: drawn by the visitor's own system font. */
  product: string;
  /** Background from, to, and the light falling on it. */
  from: string;
  to: string;
  light: string;
}

export const SCENES = {
  coffee: { product: "☕", from: "#3b2a20", to: "#c8a27c", light: "#ffe6c7" },
  sneaker: { product: "👟", from: "#1d3b4f", to: "#7fb3c8", light: "#e3f4ff" },
  plant: { product: "🪴", from: "#1f3a2b", to: "#9cc59a", light: "#efffe3" },
  lipstick: { product: "💄", from: "#4a1d2c", to: "#e3a1b0", light: "#ffe3ea" },
  headphones: { product: "🎧", from: "#24223f", to: "#8e86d6", light: "#ece9ff" },
  juice: { product: "🥤", from: "#5a2a0c", to: "#f2a65a", light: "#fff0d6" },
  candle: { product: "🕯️", from: "#2b2420", to: "#b9926a", light: "#fff2dc" },
  jacket: { product: "🧥", from: "#2c2f33", to: "#9aa5ad", light: "#f1f5f8" },
  laptop: { product: "💻", from: "#1c2530", to: "#7d93a8", light: "#e6f0fa" },
} as const satisfies Record<string, Scene>;

export type SceneKey = keyof typeof SCENES;

export interface ShowcasePost {
  handle: string;
  brand: string;
  caption: string;
  song: ShowcaseSongKey;
  scene: SceneKey;
  status: RightsAssessmentStatus;
}

/** The hero's feed: three columns of made-up paid posts. */
export const FEED: readonly (readonly ShowcasePost[])[] = [
  [
    { handle: "lena.creates", brand: "Volt Coffee", caption: "Morning ritual, finally sorted ☕ #ad", song: "clairDeLune", scene: "coffee", status: "CLEARED" },
    { handle: "maxstudio", brand: "Volt Coffee", caption: "Werbung | Cold brew season", song: "gymnopedie", scene: "juice", status: "POTENTIAL_MISMATCH" },
    { handle: "nora.lifestyle", brand: "Feld & Co.", caption: "Fit check for the weekend #sponsored", song: "spring", scene: "jacket", status: "CLEARED" },
    { handle: "danbuilds", brand: "NordHaus", caption: "Desk setup, part 3 · Anzeige", song: "air", scene: "plant", status: "UNKNOWN" },
  ],
  [
    { handle: "theurbanedit", brand: "NordHaus", caption: "Slow Sunday, new candles #ad", song: "nocturne", scene: "candle", status: "REVIEW" },
    { handle: "sophie.makes", brand: "Feld & Co.", caption: "Run club, but make it cosy #partner", song: "canon", scene: "sneaker", status: "CLEARED" },
    { handle: "lena.creates", brand: "NordHaus", caption: "Studio sound check 🎧 Werbung", song: "mountainKing", scene: "headphones", status: "UNKNOWN" },
    { handle: "maxstudio", brand: "Feld & Co.", caption: "Five-minute make-up #ad", song: "furElise", scene: "lipstick", status: "CLEARED" },
  ],
  [
    { handle: "danbuilds", brand: "Volt Coffee", caption: "Coffee and code, 6 am #ad", song: "gymnopedie", scene: "laptop", status: "POTENTIAL_MISMATCH" },
    { handle: "nora.lifestyle", brand: "NordHaus", caption: "Plant shelf glow-up · Anzeige", song: "sugarPlum", scene: "plant", status: "POTENTIAL_MISMATCH" },
    { handle: "sophie.makes", brand: "Volt Coffee", caption: "Iced latte, my way #sponsored", song: "clairDeLune", scene: "juice", status: "CLEARED" },
    { handle: "theurbanedit", brand: "Feld & Co.", caption: "Layering for autumn #ad", song: "spring", scene: "jacket", status: "CLEARED" },
  ],
];

/** The one shown on its own, with its reason ("How it works"). */
export const FEATURED: ShowcasePost = FEED[0][1];

/** What the label under every example says. */
export const SHOWCASE_NOTE = "Examples: real songs (public domain), made-up creators, brands, posts and licences.";
