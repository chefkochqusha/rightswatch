import type { RightsRecordInput } from "../rights-engine/types";

/**
 * The demo catalogue (Brief §62): the six tracks and three brands the Brief
 * names, the two campaigns the scenarios need, and the rights records on
 * file for each track. Every name is fictional and every ISRC starts with
 * the made-up registrant "DEMO".
 *
 * The rights records are chosen so the scan scenarios (`content.ts`) reach
 * every verdict the Rights Engine can give commercial content:
 *
 *  - Midnight Run — Aiko: worldwide, every usage, open-ended. Clears.
 *  - Golden Hour — Riva: Brief §10's own example record — DE/AT/CH only,
 *    organic use only, 2026-01-01 → 2026-09-22. Commercial use inside the
 *    territory isn't covered; outside it, the territory isn't; after
 *    22 September, the term has ended.
 *  - Signals — Kova: an organic-only grant, amended from 15 September 2026
 *    by a second record that does allow commercial use. Before the
 *    amendment commercial use isn't covered; after it, the two records
 *    disagree and a human has to decide which one stands.
 *  - Afterglow — Mira: every usage, but only until 14 September 2026.
 *  - Still Here — Nova: covered only for the NordHaus Autumn campaign.
 *  - City Lights: no rights record at all.
 */

export interface DemoTrack {
  trackId: string;
  title: string;
  artist: string;
  isrc: string;
}

export const DEMO_TRACKS = {
  midnightRun: { trackId: "demo-track-midnight-run", title: "Midnight Run", artist: "Aiko", isrc: "DEMO12600001" },
  goldenHour: { trackId: "demo-track-golden-hour", title: "Golden Hour", artist: "Riva", isrc: "DEMO12600002" },
  signals: { trackId: "demo-track-signals", title: "Signals", artist: "Kova", isrc: "DEMO12600003" },
  afterglow: { trackId: "demo-track-afterglow", title: "Afterglow", artist: "Mira", isrc: "DEMO12600004" },
  stillHere: { trackId: "demo-track-still-here", title: "Still Here", artist: "Nova", isrc: "DEMO12600005" },
  // The Brief lists it as "City Lights — example/demo track", with no artist.
  cityLights: { trackId: "demo-track-city-lights", title: "City Lights", artist: "Demo Artist", isrc: "DEMO12600006" },
} as const satisfies Record<string, DemoTrack>;

export type DemoTrackKey = keyof typeof DEMO_TRACKS;

export const DEMO_BRANDS = ["NordHaus", "Volt Coffee", "Feld & Co."] as const;

export interface DemoCampaign {
  id: string;
  name: string;
  createdAt: Date;
  /** Handles of the creators signed to it. */
  members: string[];
}

export const DEMO_CAMPAIGNS = {
  nordhausAutumn: {
    id: "demo-campaign-nordhaus-autumn",
    name: "NordHaus Autumn",
    createdAt: new Date("2026-07-15T00:00:00Z"),
    members: ["lena.creates"],
  },
  voltCoffeeLaunch: {
    id: "demo-campaign-volt-coffee-launch",
    name: "Volt Coffee Launch",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    members: ["theurbanedit"],
  },
} as const satisfies Record<string, DemoCampaign>;

export const DEMO_RIGHTS_RECORDS_BY_TRACK_ID: Record<string, RightsRecordInput[]> = {
  [DEMO_TRACKS.midnightRun.trackId]: [
    {
      id: "demo-rr-midnight-run",
      territories: [],
      commercialUsageAllowed: true,
      organicUsageAllowed: true,
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: null,
      campaignIds: [],
    },
  ],
  [DEMO_TRACKS.goldenHour.trackId]: [
    {
      id: "demo-rr-golden-hour-dach",
      territories: ["DE", "AT", "CH"],
      commercialUsageAllowed: false,
      organicUsageAllowed: true,
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-09-22T23:59:59Z"),
      campaignIds: [],
    },
  ],
  [DEMO_TRACKS.signals.trackId]: [
    {
      id: "demo-rr-signals-organic",
      territories: [],
      commercialUsageAllowed: false,
      organicUsageAllowed: true,
      startDate: new Date("2025-06-01T00:00:00Z"),
      endDate: null,
      campaignIds: [],
    },
    {
      id: "demo-rr-signals-amendment",
      territories: [],
      commercialUsageAllowed: true,
      organicUsageAllowed: true,
      startDate: new Date("2026-09-15T00:00:00Z"),
      endDate: null,
      campaignIds: [],
    },
  ],
  [DEMO_TRACKS.afterglow.trackId]: [
    {
      id: "demo-rr-afterglow-2026",
      territories: [],
      commercialUsageAllowed: true,
      organicUsageAllowed: true,
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-09-14T23:59:59Z"),
      campaignIds: [],
    },
  ],
  [DEMO_TRACKS.stillHere.trackId]: [
    {
      id: "demo-rr-still-here-nordhaus",
      territories: [],
      commercialUsageAllowed: true,
      organicUsageAllowed: true,
      startDate: new Date("2026-08-01T00:00:00Z"),
      endDate: null,
      campaignIds: [DEMO_CAMPAIGNS.nordhausAutumn.id],
    },
  ],
  // City Lights: deliberately nothing on file.
};
