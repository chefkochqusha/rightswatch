import type { RightsRecordInput } from '../rights-engine/types';

/**
 * Deterministic demo rights records, keyed by the MusicTrack id they're
 * for (Brief §6 Demo Mode). Track ids line up with
 * `music/fixtures.ts`, so a scan over the connector + music + rights
 * fixtures together produces a realistic, varied set of assessments
 * without touching a database.
 *
 * Chosen on purpose to hit several different real-world shapes:
 *  - demo-track-1 ("Neon Skyline"): a clean worldwide, open-ended, every-
 *    usage-type grant — always CLEARED.
 *  - demo-track-2 ("Midnight Drive"): licensed for organic use only, not
 *    commercial/paid-partnership — COMMERCIAL_USAGE_NOT_COVERED.
 *  - demo-track-3 ("Golden Hour"): no rights record on file at all —
 *    NO_RIGHTS_RECORD.
 *  - demo-track-4 ("Paper Trails"): a grant that already expired before
 *    the demo content using it was published — TERM_EXPIRED.
 *  - demo-track-5 ("Static Bloom"): two records covering the same track,
 *    territory and date that flatly disagree on commercial usage —
 *    CONFLICTING_RIGHTS_RECORDS / REVIEW.
 *  - demo-track-6 ("Slow Orbit"): a grant restricted to a specific
 *    territory, matched against content whose territory TikTok's API
 *    doesn't report (Brief §4) — UNKNOWN, not a false CLEARED or a false
 *    POTENTIAL_MISMATCH.
 *  - demo-track-7 ("Coastal Bloom"): a grant restricted to the "Summer
 *    Launch" campaign (`modules/campaigns/fixtures.ts`). demo-creator-1 is
 *    signed to that campaign and clears; demo-creator-2 is signed to no
 *    campaign at all, so the same grant can't be confirmed for them either
 *    — UNKNOWN, the campaign-dimension counterpart to demo-track-6's
 *    territory-dimension UNKNOWN.
 */
export const FIXTURE_RIGHTS_RECORDS_BY_TRACK_ID: Record<string, RightsRecordInput[]> = {
  'demo-track-1': [
    {
      id: 'rr-neon-skyline-worldwide',
      territories: [],
      commercialUsageAllowed: true,
      organicUsageAllowed: true,
      startDate: new Date('2025-01-01'),
      endDate: null,
      campaignIds: [],
    },
  ],
  'demo-track-2': [
    {
      id: 'rr-midnight-drive-organic-only',
      territories: [],
      commercialUsageAllowed: false,
      organicUsageAllowed: true,
      startDate: new Date('2025-01-01'),
      endDate: null,
      campaignIds: [],
    },
  ],
  // demo-track-3 ("Golden Hour") intentionally has no entry: no rights
  // record exists for it at all.
  'demo-track-4': [
    {
      id: 'rr-paper-trails-expired',
      territories: [],
      commercialUsageAllowed: true,
      organicUsageAllowed: true,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      campaignIds: [],
    },
  ],
  'demo-track-5': [
    {
      id: 'rr-static-bloom-allow',
      territories: [],
      commercialUsageAllowed: true,
      organicUsageAllowed: true,
      startDate: new Date('2025-01-01'),
      endDate: null,
      campaignIds: [],
    },
    {
      id: 'rr-static-bloom-deny',
      territories: [],
      commercialUsageAllowed: false,
      organicUsageAllowed: true,
      startDate: new Date('2025-01-01'),
      endDate: null,
      campaignIds: [],
    },
  ],
  'demo-track-6': [
    {
      id: 'rr-slow-orbit-us-only',
      territories: ['US'],
      commercialUsageAllowed: true,
      organicUsageAllowed: true,
      startDate: new Date('2025-01-01'),
      endDate: null,
      campaignIds: [],
    },
  ],
  'demo-track-7': [
    {
      id: 'rr-coastal-bloom-summer-launch-only',
      territories: [],
      commercialUsageAllowed: true,
      organicUsageAllowed: true,
      startDate: new Date('2025-01-01'),
      endDate: null,
      campaignIds: ['campaign-summer-launch'],
    },
  ],
};
