import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runScan } from './run-scan';
import { MockTikTokConnector } from '../connectors/tiktok/mock-connector';
import { FixtureMusicIdentificationProvider } from '../music/fixture-provider';
import { FixtureRightsRepository } from '../rights/fixture-repository';
import { FixtureCampaignRepository } from '../campaigns/fixture-repository';
import type {
  ConnectorFetchParams,
  ConnectorFetchResult,
  PlatformConnector,
} from '../connectors/types';
import type {
  MusicIdentificationInput,
  MusicIdentificationProvider,
  MusicIdentificationResult,
} from '../music/types';

const FAR_PAST = new Date('2000-01-01');
const FAR_FUTURE = new Date('2100-01-01');

function demoParams(creatorExternalId: string, creatorUsername: string) {
  const rightsRepo = new FixtureRightsRepository();
  const campaignRepo = new FixtureCampaignRepository();
  return {
    connector: new MockTikTokConnector(),
    musicProvider: new FixtureMusicIdentificationProvider(),
    getRightsRecordsForTrack: (trackId: string) => rightsRepo.getRecordsForTrack(trackId),
    getCampaignIdsForCreator: async (id: string) =>
      (await campaignRepo.findForCreator(id)).map((c) => c.id),
    creatorExternalId,
    creatorUsername,
    since: FAR_PAST,
    until: FAR_FUTURE,
  };
}

describe('runScan (end-to-end over the demo fixtures)', () => {
  test('demo-creator-1: one cleared, one flagged with no rights record at all, one cleared via campaign match', async () => {
    const result = await runScan(demoParams('demo-creator-1', 'mia.dances'));
    assert.equal(result.connectorError, null);
    assert.equal(result.items.length, 3);

    const byContentId = Object.fromEntries(
      result.items.map((item) => [item.content.externalContentId, item]),
    );

    const cleared = byContentId['tt-cc-1001'];
    assert.equal(cleared.kind, 'ASSESSED');
    if (cleared.kind === 'ASSESSED') {
      assert.equal(cleared.assessment.status, 'CLEARED');
    }

    const noRecord = byContentId['tt-cc-1002'];
    assert.equal(noRecord.kind, 'ASSESSED');
    if (noRecord.kind === 'ASSESSED') {
      assert.equal(noRecord.assessment.status, 'POTENTIAL_MISMATCH');
      assert.equal(noRecord.assessment.reason, 'NO_RIGHTS_RECORD');
    }

    // demo-creator-1 is signed to exactly one campaign fixture ("Summer
    // Launch"), so this campaign-scoped rights record confidently clears.
    const campaignCleared = byContentId['tt-cc-1003'];
    assert.equal(campaignCleared.kind, 'ASSESSED');
    if (campaignCleared.kind === 'ASSESSED') {
      assert.equal(campaignCleared.assessment.status, 'CLEARED');
    }
  });

  test('demo-creator-2: one flagged as commercial-not-covered, one cleared, one UNKNOWN via campaign non-membership', async () => {
    const result = await runScan(demoParams('demo-creator-2', 'leon.fit'));
    assert.equal(result.items.length, 3);
    const byContentId = Object.fromEntries(
      result.items.map((item) => [item.content.externalContentId, item]),
    );

    const organicOnly = byContentId['tt-cc-2001'];
    assert.equal(organicOnly.kind, 'ASSESSED');
    if (organicOnly.kind === 'ASSESSED') {
      assert.equal(organicOnly.assessment.status, 'POTENTIAL_MISMATCH');
      assert.equal(organicOnly.assessment.reason, 'COMMERCIAL_USAGE_NOT_COVERED');
    }

    const cleared = byContentId['tt-cc-2002'];
    assert.equal(cleared.kind, 'ASSESSED');
    if (cleared.kind === 'ASSESSED') {
      assert.equal(cleared.assessment.status, 'CLEARED');
    }

    // demo-creator-2 is signed to no campaign at all, so the same
    // campaign-scoped record demo-creator-1 clears against can't be
    // confirmed either way for them — UNKNOWN, not a guessed CLEARED or a
    // false POTENTIAL_MISMATCH.
    const campaignUnknown = byContentId['tt-cc-2003'];
    assert.equal(campaignUnknown.kind, 'ASSESSED');
    if (campaignUnknown.kind === 'ASSESSED') {
      assert.equal(campaignUnknown.assessment.status, 'UNKNOWN');
      assert.equal(campaignUnknown.assessment.reason, 'MANUAL_REVIEW_REQUIRED');
    }
  });

  test('demo-creator-3: flagged as term-expired', async () => {
    const result = await runScan(demoParams('demo-creator-3', 'noah.cooks'));
    assert.equal(result.items.length, 1);
    const [item] = result.items;
    assert.equal(item.kind, 'ASSESSED');
    if (item.kind === 'ASSESSED') {
      assert.equal(item.assessment.status, 'POTENTIAL_MISMATCH');
      assert.equal(item.assessment.reason, 'TERM_EXPIRED');
    }
  });

  test('demo-creator-4: conflicting records surface as REVIEW, ambiguous territory surfaces as UNKNOWN', async () => {
    const result = await runScan(demoParams('demo-creator-4', 'priya.beauty'));
    assert.equal(result.items.length, 2);
    const byContentId = Object.fromEntries(
      result.items.map((item) => [item.content.externalContentId, item]),
    );

    const conflicting = byContentId['tt-cc-4001'];
    assert.equal(conflicting.kind, 'ASSESSED');
    if (conflicting.kind === 'ASSESSED') {
      assert.equal(conflicting.assessment.status, 'REVIEW');
      assert.equal(conflicting.assessment.reason, 'CONFLICTING_RIGHTS_RECORDS');
    }

    const ambiguousTerritory = byContentId['tt-cc-4002'];
    assert.equal(ambiguousTerritory.kind, 'ASSESSED');
    if (ambiguousTerritory.kind === 'ASSESSED') {
      assert.equal(ambiguousTerritory.assessment.status, 'UNKNOWN');
      assert.equal(ambiguousTerritory.assessment.reason, 'MANUAL_REVIEW_REQUIRED');
    }
  });

  test('a narrower date window excludes content published outside it', async () => {
    const result = await runScan({
      ...demoParams('demo-creator-1', 'mia.dances'),
      since: new Date('2025-01-01'),
      until: new Date('2025-12-31'),
    });
    // Only tt-cc-1001 (2025-11-03) falls in this window; tt-cc-1002 is 2026.
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].content.externalContentId, 'tt-cc-1001');
  });
});

describe('runScan (isolated branch behavior with fakes)', () => {
  test('propagates a connector error without attempting music ID', async () => {
    const failingConnector: PlatformConnector = {
      platform: 'TIKTOK',
      async fetchCommercialContent(_params: ConnectorFetchParams): Promise<ConnectorFetchResult> {
        return { items: [], error: 'TikTok API rate limit exceeded' };
      },
    };
    const rightsRepo = new FixtureRightsRepository();
    const result = await runScan({
      connector: failingConnector,
      musicProvider: new FixtureMusicIdentificationProvider(),
      getRightsRecordsForTrack: (trackId) => rightsRepo.getRecordsForTrack(trackId),
      getCampaignIdsForCreator: async () => [],
      creatorExternalId: 'demo-creator-1',
      creatorUsername: 'mia.dances',
      since: FAR_PAST,
      until: FAR_FUTURE,
    });
    assert.equal(result.connectorError, 'TikTok API rate limit exceeded');
    assert.deepEqual(result.items, []);
  });

  test('a content item with no identifiable track is reported as NO_MUSIC_MATCH', async () => {
    const result = await runScan({
      connector: new MockTikTokConnector(),
      // Always "finds" nothing, regardless of input.
      musicProvider: {
        providerName: 'silent',
        async identify(_input: MusicIdentificationInput): Promise<MusicIdentificationResult> {
          return { matches: [], error: null };
        },
      },
      getRightsRecordsForTrack: async () => [],
      getCampaignIdsForCreator: async () => [],
      creatorExternalId: 'demo-creator-1',
      creatorUsername: 'mia.dances',
      since: FAR_PAST,
      until: FAR_FUTURE,
    });
    assert.equal(result.items.length, 3);
    assert.ok(result.items.every((item) => item.kind === 'NO_MUSIC_MATCH'));
  });

  test('a music identification failure is reported per-item, not thrown', async () => {
    const failingProvider: MusicIdentificationProvider = {
      providerName: 'broken',
      async identify(_input: MusicIdentificationInput): Promise<MusicIdentificationResult> {
        return { matches: [], error: 'fingerprinting service unavailable' };
      },
    };
    const result = await runScan({
      connector: new MockTikTokConnector(),
      musicProvider: failingProvider,
      getRightsRecordsForTrack: async () => [],
      getCampaignIdsForCreator: async () => [],
      creatorExternalId: 'demo-creator-3',
      creatorUsername: 'noah.cooks',
      since: FAR_PAST,
      until: FAR_FUTURE,
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].kind, 'MUSIC_ID_ERROR');
    if (result.items[0].kind === 'MUSIC_ID_ERROR') {
      assert.equal(result.items[0].error, 'fingerprinting service unavailable');
    }
  });
});

describe('runScan (campaign id resolution)', () => {
  // A minimal, single-item harness isolated from the shared demo fixtures,
  // so these tests exercise exactly one thing: how run-scan.ts reduces
  // `getCampaignIdsForCreator`'s list down to the single `campaignId` the
  // Rights Engine's input expects. The one rights record on file is always
  // scoped to 'campaign-a' — only `getCampaignIdsForCreator` varies.
  const singleItemConnector: PlatformConnector = {
    platform: 'TIKTOK',
    async fetchCommercialContent(_params: ConnectorFetchParams): Promise<ConnectorFetchResult> {
      return {
        error: null,
        items: [
          {
            platform: 'TIKTOK',
            externalContentId: 'cc-1',
            creatorExternalId: 'creator-1',
            creatorUsername: 'creator.one',
            publishedAt: new Date('2025-06-01'),
            brandNames: ['Test Brand'],
            label: 'Paid partnership',
            territory: null,
            videoUrls: [],
            rawPayload: {},
          },
        ],
      };
    },
  };
  const singleMatchProvider: MusicIdentificationProvider = {
    providerName: 'fixed',
    async identify(_input: MusicIdentificationInput): Promise<MusicIdentificationResult> {
      return {
        error: null,
        matches: [
          {
            trackId: 'track-x',
            title: 'Track X',
            artist: 'Test Artist',
            isrc: null,
            confidence: 1,
            provider: 'fixed',
            manual: false,
          },
        ],
      };
    },
  };
  function baseParams(getCampaignIdsForCreator: () => Promise<string[]>) {
    return {
      connector: singleItemConnector,
      musicProvider: singleMatchProvider,
      getRightsRecordsForTrack: async () => [
        {
          id: 'rr-campaign-a-only',
          territories: [],
          commercialUsageAllowed: true,
          organicUsageAllowed: true,
          startDate: new Date('2025-01-01'),
          endDate: null,
          campaignIds: ['campaign-a'],
        },
      ],
      getCampaignIdsForCreator,
      creatorExternalId: 'creator-1',
      creatorUsername: 'creator.one',
      since: FAR_PAST,
      until: FAR_FUTURE,
    };
  }

  test('exactly one campaign membership resolves to that campaign id and clears a matching record', async () => {
    const result = await runScan(baseParams(async () => ['campaign-a']));
    assert.equal(result.items[0].kind, 'ASSESSED');
    if (result.items[0].kind === 'ASSESSED') {
      assert.equal(result.items[0].assessment.status, 'CLEARED');
    }
  });

  test('exactly one campaign membership that does not match the record is a confident mismatch, not UNKNOWN', async () => {
    const result = await runScan(baseParams(async () => ['campaign-x']));
    assert.equal(result.items[0].kind, 'ASSESSED');
    if (result.items[0].kind === 'ASSESSED') {
      assert.equal(result.items[0].assessment.status, 'POTENTIAL_MISMATCH');
      assert.equal(result.items[0].assessment.reason, 'CAMPAIGN_NOT_COVERED');
    }
  });

  test('zero campaign memberships falls back to null and surfaces UNKNOWN for a campaign-scoped record', async () => {
    const result = await runScan(baseParams(async () => []));
    assert.equal(result.items[0].kind, 'ASSESSED');
    if (result.items[0].kind === 'ASSESSED') {
      assert.equal(result.items[0].assessment.status, 'UNKNOWN');
      assert.equal(result.items[0].assessment.reason, 'MANUAL_REVIEW_REQUIRED');
    }
  });

  test('more than one campaign membership is ambiguous and also falls back to null (never guesses)', async () => {
    // Note 'campaign-a' — the record's own scope — is among the memberships
    // here, but the pipeline still can't confirm which one applies to this
    // specific piece of content, so it stays UNKNOWN rather than guessing
    // right.
    const result = await runScan(baseParams(async () => ['campaign-a', 'campaign-b']));
    assert.equal(result.items[0].kind, 'ASSESSED');
    if (result.items[0].kind === 'ASSESSED') {
      assert.equal(result.items[0].assessment.status, 'UNKNOWN');
      assert.equal(result.items[0].assessment.reason, 'MANUAL_REVIEW_REQUIRED');
    }
  });
});
