import type { CampaignRecord } from './types';

/**
 * Deterministic demo campaign data (Brief §6 Demo Mode), same spirit as
 * `rights/fixtures.ts`: one fixed, reused-everywhere dataset rather than
 * anything scoped to a specific real workspace (see the doc comment on
 * `CampaignRecord` for why). `demo-creator-1` (mia.dances) is deliberately
 * the only demo creator seeded into a campaign — most real creators aren't
 * part of any active campaign either, campaigns are the exception, and
 * having exactly one single-campaign creator is what makes the scan
 * pipeline's campaign-matching resolution (run-scan.ts) unambiguous and
 * demonstrable. `demo-track-7` (music/fixtures.ts) and its campaign-scoped
 * rights record (rights/fixtures.ts) are the paired scenario this exists to
 * exercise:
 *
 *  - tt-cc-1003 (demo-creator-1, IS in Summer Launch) matches the
 *    campaign-scoped record and clears.
 *  - tt-cc-2003 (demo-creator-2, in no campaign at all) can't be confirmed
 *    against that same campaign-scoped record, and correctly surfaces as
 *    UNKNOWN for a human to check, rather than a guessed CLEARED or a false
 *    POTENTIAL_MISMATCH (see rights-engine/assess.ts's UNKNOWN handling).
 */
export const FIXTURE_CAMPAIGNS = {
  summerLaunch: {
    id: 'campaign-summer-launch',
    name: 'Summer Launch',
    createdAt: new Date('2026-05-01'),
  } satisfies CampaignRecord,
};

/** creatorExternalId -> every campaign fixture that creator is a member of.
 *  Absence from this map (demo-creator-2 through 4) means zero campaigns,
 *  exactly like a typical real creator who isn't signed to any campaign. */
export const FIXTURE_CAMPAIGN_MEMBERSHIPS_BY_CREATOR_ID: Record<string, CampaignRecord[]> = {
  'demo-creator-1': [FIXTURE_CAMPAIGNS.summerLaunch],
};
