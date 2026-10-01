import type { NormalizedCommercialContent } from "../connectors/types";
import { DEMO_BRANDS, type DemoTrackKey } from "./catalog";
import { DEMO_NAMED_CREATORS } from "./creators";
import { draw, hashString, pickWeighted } from "./random";

/**
 * Demo commercial content — what the demo TikTok connector "finds" — and
 * what the demo music provider "identifies" in it (Brief §48, §62).
 *
 * Two sources, both deterministic:
 *
 *  - **Scenarios.** Fifteen hand-written posts by the six creators Brief
 *    §62 names, published in September 2026. Together they reach every
 *    verdict the Rights Engine gives commercial content (see `catalog.ts`
 *    for the rights records they run into), plus a post with no
 *    identifiable track and one whose identification fails.
 *  - **Generated posts**, for any other username — which is what lets a
 *    workspace add a creator of its own and see a demo scan find something
 *    (Brief §72, steps 5–9). Each creator posts at its own steady rate from
 *    June 2026 onwards; whether a given day has a post, its brand, and
 *    whether a catalogue track is identified in it all come from seeded
 *    draws, so the same username and window always yield the same posts.
 *    The six named creators get generated posts too, after the scenarios
 *    end (`DEMO_AS_OF`), so their monitoring keeps going like anyone's.
 *
 * Nothing is ever published after the window a caller asks for, and the
 * demo connector caps that window at the present (`mock-connector.ts`):
 * a scan run today finds today's posts, and nothing from the future.
 *
 * Brief §48 sets the scale: 48 monitored creators, 186 new videos, 27
 * music matches, 11 open cases and 7 newly detected matches. Over Demo
 * Mode's window (`DEMO_WINDOW_START` → `DEMO_AS_OF`), across the 48 demo
 * creators, the scenarios plus the generated posts land on exactly those
 * numbers: `DEMO_SALT` is the seed that does, and `content.test.ts` checks
 * it through the real pipeline. Changing a rate, weight or rights record
 * moves the numbers; `scripts/demo-data/find-salt.ts` finds a seed that
 * lands on them again.
 */

/** The end of the window Demo Mode shows. */
export const DEMO_AS_OF = new Date("2026-09-30T23:59:59Z");
/** The start of that window: the 30 days Brief §48's numbers describe. */
export const DEMO_WINDOW_START = new Date("2026-09-01T00:00:00Z");
/** A match published on or after this is "newly detected": the window's last
 *  seven days. */
export const DEMO_NEW_SINCE = new Date("2026-09-24T00:00:00Z");

export const DEMO_SALT = "rw-demo-16664";

/** No generated post is published before this. */
const GENERATOR_EPOCH = Date.UTC(2026, 5, 1);
const DAY_MS = 86_400_000;
/** Posts per 30 days: each creator gets a steady rate somewhere in here. */
const MIN_RATE = 2;
const MAX_RATE = 7;
/** Share of generated posts with a catalogue track identified in them, and
 *  with an identification that fails outright. */
const MATCH_RATE = 0.08;
const ERROR_RATE = 0.01;
/** Which catalogue track an identified generated post uses. Mostly tracks
 *  the workspace has cleared — most commercial use of a catalogue is
 *  licensed; the rest is what a rights team spends its time on. */
const TRACK_WEIGHTS: readonly (readonly [DemoTrackKey, number])[] = [
  ["midnightRun", 0.62],
  ["afterglow", 0.14],
  ["goldenHour", 0.07],
  ["signals", 0.07],
  ["stillHere", 0.06],
  ["cityLights", 0.04],
];

export type DemoIdentification =
  | { kind: "match"; track: DemoTrackKey; confidence: number }
  | { kind: "none" }
  | { kind: "error" };

/** How a failed demo identification reads (Brief §37: human-readable). */
export const DEMO_IDENTIFICATION_ERROR =
  "The music identification service timed out on this video. The next scan tries again.";

interface Scenario {
  id: string;
  handle: string;
  publishedAt: string;
  brand: (typeof DEMO_BRANDS)[number];
  videoNumber: string;
  identification: DemoIdentification;
}

const match = (track: DemoTrackKey, confidence: number): DemoIdentification => ({ kind: "match", track, confidence });

// Each line's comment is the verdict it's there to produce (creator
// countries and campaigns: `creators.ts`, `catalog.ts`).
const SCENARIOS: readonly Scenario[] = [
  // Covered worldwide for every usage.
  { id: "DEMO-V-1001", handle: "lena.creates", publishedAt: "2026-09-27T16:40:00Z", brand: "Volt Coffee", videoNumber: "7419000000000001001", identification: match("midnightRun", 0.974) },
  // Covered for NordHaus Autumn, and Lena is signed to it.
  { id: "DEMO-V-1002", handle: "lena.creates", publishedAt: "2026-09-08T11:15:00Z", brand: "NordHaus", videoNumber: "7419000000000001002", identification: match("stillHere", 0.931) },
  // Austria is inside DE/AT/CH, but the record allows organic use only.
  { id: "DEMO-V-2001", handle: "maxstudio", publishedAt: "2026-09-12T18:05:00Z", brand: "NordHaus", videoNumber: "7419000000000002001", identification: match("goldenHour", 0.941) },
  // Published after the record's term ended (22 September).
  { id: "DEMO-V-2002", handle: "maxstudio", publishedAt: "2026-09-27T09:30:00Z", brand: "Volt Coffee", videoNumber: "7419000000000002002", identification: match("goldenHour", 0.902) },
  // Only the organic-only record was in force yet.
  { id: "DEMO-V-3001", handle: "theurbanedit", publishedAt: "2026-09-10T13:20:00Z", brand: "Feld & Co.", videoNumber: "7419000000000003001", identification: match("signals", 0.918) },
  // After the amendment, two records disagree about commercial use.
  { id: "DEMO-V-3002", handle: "theurbanedit", publishedAt: "2026-09-26T19:45:00Z", brand: "Feld & Co.", videoNumber: "7419000000000003002", identification: match("signals", 0.887) },
  // Covered for NordHaus Autumn only; this creator is on Volt Coffee Launch.
  { id: "DEMO-V-3003", handle: "theurbanedit", publishedAt: "2026-09-19T15:00:00Z", brand: "Volt Coffee", videoNumber: "7419000000000003003", identification: match("stillHere", 0.912) },
  // Inside Afterglow's term (ends 14 September).
  { id: "DEMO-V-4001", handle: "sophie.makes", publishedAt: "2026-09-05T10:10:00Z", brand: "NordHaus", videoNumber: "7419000000000004001", identification: match("afterglow", 0.883) },
  // After it.
  { id: "DEMO-V-4002", handle: "sophie.makes", publishedAt: "2026-09-26T17:25:00Z", brand: "NordHaus", videoNumber: "7419000000000004002", identification: match("afterglow", 0.861) },
  // A US creator, a DE/AT/CH-only record.
  { id: "DEMO-V-4003", handle: "sophie.makes", publishedAt: "2026-09-18T12:00:00Z", brand: "Feld & Co.", videoNumber: "7419000000000004003", identification: match("goldenHour", 0.954) },
  // A campaign-scoped record, and a creator on no campaign: can't confirm.
  { id: "DEMO-V-5001", handle: "danbuilds", publishedAt: "2026-09-26T08:50:00Z", brand: "Volt Coffee", videoNumber: "7419000000000005001", identification: match("stillHere", 0.96) },
  // No catalogue track identified.
  { id: "DEMO-V-5002", handle: "danbuilds", publishedAt: "2026-09-21T20:15:00Z", brand: "Volt Coffee", videoNumber: "7419000000000005002", identification: { kind: "none" } },
  // A catalogue track with no rights record on file.
  { id: "DEMO-V-6001", handle: "nora.lifestyle", publishedAt: "2026-09-25T14:35:00Z", brand: "Feld & Co.", videoNumber: "7419000000000006001", identification: match("cityLights", 0.795) },
  // Identification failed; the next scan retries it.
  { id: "DEMO-V-6002", handle: "nora.lifestyle", publishedAt: "2026-09-29T07:55:00Z", brand: "Volt Coffee", videoNumber: "7419000000000006002", identification: { kind: "error" } },
  // Covered worldwide for every usage.
  { id: "DEMO-V-6003", handle: "nora.lifestyle", publishedAt: "2026-09-14T18:30:00Z", brand: "NordHaus", videoNumber: "7419000000000006003", identification: match("midnightRun", 0.968) },
];

const SCENARIOS_BY_ID = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));
const SCENARIO_CREATORS = new Set(DEMO_NAMED_CREATORS.map((creator) => creator.handle));

/** Every scenario post's id, for tests and anything that wants to point at
 *  one directly. */
export const DEMO_SCENARIO_IDS: readonly string[] = SCENARIOS.map((scenario) => scenario.id);

/**
 * The demo posts `handle` published between `since` and `until`
 * (inclusive), oldest first. A username is matched case-insensitively, as
 * TikTok treats them.
 */
export function demoContentFor(
  handle: string,
  since: Date,
  until: Date,
  salt: string = DEMO_SALT,
): NormalizedCommercialContent[] {
  const username = handle.toLowerCase();
  const posts: NormalizedCommercialContent[] = [];

  for (const scenario of SCENARIOS) {
    if (scenario.handle !== username) continue;
    const publishedAt = new Date(scenario.publishedAt);
    if (publishedAt < since || publishedAt > until) continue;
    posts.push(buildPost(username, scenario.id, publishedAt, scenario.brand, scenario.videoNumber));
  }

  const firstDay = Math.max(0, dayIndex(since));
  const lastDay = dayIndex(until);
  const rate = MIN_RATE + draw(salt, username, "rate") * (MAX_RATE - MIN_RATE);
  const dailyChance = rate / 30;
  for (let day = firstDay; day <= lastDay; day++) {
    // The named creators' posts up to the end of Demo Mode's window are the
    // hand-written scenarios above, not generated ones.
    if (SCENARIO_CREATORS.has(username) && GENERATOR_EPOCH + day * DAY_MS <= DEMO_AS_OF.getTime()) continue;
    if (draw(salt, username, day, "post") >= dailyChance) continue;

    // Between 07:00 and 21:59 UTC.
    const minuteOfDay = 7 * 60 + Math.floor(draw(salt, username, day, "time") * 15 * 60);
    const publishedAt = new Date(GENERATOR_EPOCH + day * DAY_MS + minuteOfDay * 60_000);
    if (publishedAt < since || publishedAt > until) continue;

    const brand = DEMO_BRANDS[Math.floor(draw(salt, username, day, "brand") * DEMO_BRANDS.length)];
    posts.push(buildPost(username, generatedId(username, day), publishedAt, brand, videoNumberFor(username, day)));
  }

  return posts.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
}

/**
 * What the demo music provider identifies in a demo post: the scenario's
 * own answer for a hand-written one, a seeded draw for a generated one, and
 * nothing at all for content that isn't demo content.
 */
export function demoIdentificationFor(contentId: string, salt: string = DEMO_SALT): DemoIdentification {
  const scenario = SCENARIOS_BY_ID.get(contentId);
  if (scenario) return scenario.identification;
  if (!contentId.startsWith(GENERATED_PREFIX)) return { kind: "none" };

  if (draw(salt, contentId, "identify-error") < ERROR_RATE) return { kind: "error" };
  if (draw(salt, contentId, "identify-match") >= MATCH_RATE) return { kind: "none" };
  const track = pickWeighted(TRACK_WEIGHTS, draw(salt, contentId, "identify-track"));
  const confidence = Math.round((0.78 + draw(salt, contentId, "identify-confidence") * 0.21) * 1000) / 1000;
  return { kind: "match", track, confidence };
}

const GENERATED_PREFIX = "DEMO-V-G";

function dayIndex(date: Date): number {
  return Math.floor((date.getTime() - GENERATOR_EPOCH) / DAY_MS);
}

/** Stable per creator and day, and unique in practice: two independent
 *  32-bit hashes of the username. */
function generatedId(username: string, day: number): string {
  const tag = hashString(username).toString(36) + hashString(`${username}#`).toString(36);
  return `${GENERATED_PREFIX}${tag.toUpperCase()}-${day}`;
}

/** A 19-digit, TikTok-shaped video number for the post's URL. */
function videoNumberFor(username: string, day: number): string {
  const high = hashString(`${username}/${day}/a`) % 1_000_000_000;
  const low = hashString(`${username}/${day}/b`) % 1_000_000_000;
  return `7${String(high).padStart(9, "0")}${String(low).padStart(9, "0")}`;
}

/** The connector's normalized shape, with a raw payload in the documented
 *  Commercial Content API fields only (Brief §4). */
function buildPost(
  username: string,
  id: string,
  publishedAt: Date,
  brand: string,
  videoNumber: string,
): NormalizedCommercialContent {
  const videoUrl = `https://www.tiktok.com/@${username}/video/${videoNumber}`;
  return {
    platform: "TIKTOK",
    externalContentId: id,
    creatorExternalId: username,
    creatorUsername: username,
    publishedAt,
    brandNames: [brand],
    label: "Paid partnership",
    videoUrls: [videoUrl],
    territory: null,
    rawPayload: {
      id,
      create_timestamp: Math.floor(publishedAt.getTime() / 1000),
      create_date: publishedAt.toISOString().slice(0, 10),
      label: "Paid partnership",
      brand_names: [brand],
      creator: username,
      videos: [videoUrl],
    },
  };
}
