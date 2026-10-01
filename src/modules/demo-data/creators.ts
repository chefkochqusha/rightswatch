/**
 * Demo creators (Brief §62, §48). The six the Brief names come first, with
 * the countries and follower counts the validated prototype showed for
 * them; the other 42 make up §48's "48 monitored creators". All fictional.
 *
 * `country` is what a workspace member would enter for a creator (Brief §8)
 * — TikTok's Commercial Content API reports no territory for a post, so a
 * creator's country is the territory signal the Rights Engine gets
 * (`runScan`'s `creatorCountry`). `null` is a creator nobody has placed.
 */

export interface DemoCreatorProfile {
  handle: string;
  displayName: string;
  country: string | null;
  followerCount: number;
}

export const DEMO_NAMED_CREATORS: readonly DemoCreatorProfile[] = [
  { handle: "lena.creates", displayName: "Lena Creates", country: "DE", followerCount: 182_000 },
  { handle: "maxstudio", displayName: "Max Studio", country: "AT", followerCount: 96_000 },
  { handle: "theurbanedit", displayName: "The Urban Edit", country: "CH", followerCount: 241_000 },
  { handle: "sophie.makes", displayName: "Sophie Makes", country: "US", followerCount: 58_000 },
  { handle: "danbuilds", displayName: "Dan Builds", country: "DE", followerCount: 133_000 },
  { handle: "nora.lifestyle", displayName: "Nora Lifestyle", country: "DE", followerCount: 77_000 },
];

export const DEMO_EXTRA_CREATORS: readonly DemoCreatorProfile[] = [
  { handle: "julia.bakes", displayName: "Julia Bakes", country: "DE", followerCount: 64_000 },
  { handle: "tomtravels", displayName: "Tom Travels", country: "GB", followerCount: 212_000 },
  { handle: "mira.moves", displayName: "Mira Moves", country: "AT", followerCount: 38_000 },
  { handle: "kai.cuts", displayName: "Kai Cuts", country: "DE", followerCount: 91_000 },
  { handle: "elena.studio", displayName: "Elena Studio", country: "ES", followerCount: 147_000 },
  { handle: "ben.outdoors", displayName: "Ben Outdoors", country: "CH", followerCount: 53_000 },
  { handle: "yara.styles", displayName: "Yara Styles", country: "NL", followerCount: 176_000 },
  { handle: "finnfilms", displayName: "Finn Films", country: null, followerCount: 29_000 },
  { handle: "ava.atelier", displayName: "Ava Atelier", country: "FR", followerCount: 268_000 },
  { handle: "leo.lifts", displayName: "Leo Lifts", country: "US", followerCount: 335_000 },
  { handle: "zoe.zest", displayName: "Zoe Zest", country: "GB", followerCount: 47_000 },
  { handle: "paul.paints", displayName: "Paul Paints", country: "AT", followerCount: 22_000 },
  { handle: "ines.interiors", displayName: "Ines Interiors", country: "DE", followerCount: 118_000 },
  { handle: "hana.home", displayName: "Hana Home", country: "CH", followerCount: 73_000 },
  { handle: "jonas.jams", displayName: "Jonas Jams", country: "DE", followerCount: 156_000 },
  { handle: "clara.cooks", displayName: "Clara Cooks", country: "DE", followerCount: 199_000 },
  { handle: "milo.makes", displayName: "Milo Makes", country: "SE", followerCount: 34_000 },
  { handle: "rosa.runs", displayName: "Rosa Runs", country: "ES", followerCount: 82_000 },
  { handle: "felix.fixes", displayName: "Felix Fixes", country: "DE", followerCount: 61_000 },
  { handle: "lou.looks", displayName: "Lou Looks", country: "FR", followerCount: 129_000 },
  { handle: "emil.eats", displayName: "Emil Eats", country: "DK", followerCount: 45_000 },
  { handle: "sara.sews", displayName: "Sara Sews", country: "IT", followerCount: 57_000 },
  { handle: "nico.nights", displayName: "Nico Nights", country: "DE", followerCount: 98_000 },
  { handle: "ella.edits", displayName: "Ella Edits", country: "GB", followerCount: 186_000 },
  { handle: "oskar.outside", displayName: "Oskar Outside", country: "SE", followerCount: 41_000 },
  { handle: "lina.learns", displayName: "Lina Learns", country: null, followerCount: 27_000 },
  { handle: "matteo.mixes", displayName: "Matteo Mixes", country: "IT", followerCount: 143_000 },
  { handle: "ruby.rides", displayName: "Ruby Rides", country: "US", followerCount: 88_000 },
  { handle: "anton.analog", displayName: "Anton Analog", country: "AT", followerCount: 19_000 },
  { handle: "mia.minimal", displayName: "Mia Minimal", country: "DE", followerCount: 210_000 },
  { handle: "jan.journeys", displayName: "Jan Journeys", country: "NL", followerCount: 66_000 },
  { handle: "greta.grows", displayName: "Greta Grows", country: "DE", followerCount: 51_000 },
  { handle: "sam.sounds", displayName: "Sam Sounds", country: "US", followerCount: 402_000 },
  { handle: "lara.layers", displayName: "Lara Layers", country: "CH", followerCount: 37_000 },
  { handle: "david.daily", displayName: "David Daily", country: "DE", followerCount: 124_000 },
  { handle: "iris.inks", displayName: "Iris Inks", country: "FR", followerCount: 59_000 },
  { handle: "theo.tries", displayName: "Theo Tries", country: "GB", followerCount: 77_000 },
  { handle: "amelie.aesthetic", displayName: "Amélie Aesthetic", country: "FR", followerCount: 233_000 },
  { handle: "lukas.lab", displayName: "Lukas Lab", country: "DE", followerCount: 49_000 },
  { handle: "vera.vintage", displayName: "Vera Vintage", country: "AT", followerCount: 31_000 },
  { handle: "henry.hikes", displayName: "Henry Hikes", country: "US", followerCount: 96_000 },
  { handle: "pia.plants", displayName: "Pia Plants", country: "DE", followerCount: 43_000 },
];

/** Every demo creator — §48's 48 monitored creators. */
export const DEMO_CREATORS: readonly DemoCreatorProfile[] = [...DEMO_NAMED_CREATORS, ...DEMO_EXTRA_CREATORS];

export function findDemoCreator(handle: string): DemoCreatorProfile | null {
  const normalized = handle.toLowerCase();
  return DEMO_CREATORS.find((creator) => creator.handle === normalized) ?? null;
}
