import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runScan } from './run-scan';
import { MockTikTokConnector } from '../connectors/tiktok/mock-connector';
import { FixtureMusicIdentificationProvider } from '../music/fixture-provider';
import { FixtureRightsRepository } from '../rights/fixture-repository';
import { FixtureCampaignRepository } from '../campaigns/fixture-repository';
import { findDemoCatalogueTrack } from '../demo-data/catalog';
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

// The demo dataset's scenarios are all in September 2026; a demo connector
// pinned to the end of it sees exactly those (the full scenario table is
// checked in demo-snapshot.test.ts).
const SINCE = new Date('2026-09-01T00:00:00Z');
const UNTIL = new Date('2026-09-30T23:59:59Z');
const demoConnector = () => new MockTikTokConnector({ now: () => UNTIL });
// Fakes whose every identified track counts as a catalogue song.
const inCatalogue = async (match: { trackId: string }) => match.trackId;

function demoParams(creatorUsername: string, creatorCountry: string | null) {
  const rightsRepo = new FixtureRightsRepository();
  const campaignRepo = new FixtureCampaignRepository();
  return {
    connector: demoConnector(),
    musicProvider: new FixtureMusicIdentificationProvider(),
    getRightsRecordsForTrack: (trackId: string) => rightsRepo.getRecordsForTrack(trackId),
    getCampaignIdsForCreator: async (id: string) =>
      (await campaignRepo.findForCreator(id)).map((c) => c.id),
    findCatalogueTrack: findDemoCatalogueTrack,
    creatorExternalId: creatorUsername,
    creatorUsername,
    creatorCountry,
    since: SINCE,
    until: UNTIL,
  };
}

describe('runScan (end-to-end over the demo dataset)', () => {
  test('lena.creates: cleared worldwide, and cleared through her campaign', async () => {
    const result = await runScan(demoParams('lena.creates', 'DE'));
    assert.equal(result.connectorError, null);
    assert.deepEqual(
      result.items.map((item) => (item.kind === 'ASSESSED' ? item.assessment.status : item.kind)),
      ['CLEARED', 'CLEARED'],
    );
  });

  test("sophie.makes: the creator's country decides a territory-restricted record", async () => {
    const result = await runScan(demoParams('sophie.makes', 'US'));
    const territory = result.items.find((item) => item.content.externalContentId === 'DEMO-V-4003');
    assert.equal(territory?.kind, 'ASSESSED');
    if (territory?.kind === 'ASSESSED') {
      assert.equal(territory.assessment.status, 'POTENTIAL_MISMATCH');
      assert.equal(territory.assessment.reason, 'TERRITORY_NOT_COVERED');
      // Says where the territory came from: TikTok reports none.
      assert.match(territory.assessment.explanation, /country on file for this creator/);
    }
  });

  test('a narrower date window excludes content published outside it', async () => {
    const result = await runScan({
      ...demoParams('lena.creates', 'DE'),
      since: new Date('2026-09-01T00:00:00Z'),
      until: new Date('2026-09-15T00:00:00Z'),
    });
    // Only DEMO-V-1002 (8 September) falls in this window; DEMO-V-1001 is
    // the 27th.
    assert.deepEqual(result.items.map((item) => item.content.externalContentId), ['DEMO-V-1002']);
  });
});

describe('runScan (territory signal)', () => {
  // One post, one rights record restricted to Germany — only where the
  // territory comes from varies.
  function territoryParams(postTerritory: string | null, creatorCountry: string | null) {
    const connector: PlatformConnector = {
      platform: 'TIKTOK',
      async fetchCommercialContent(): Promise<ConnectorFetchResult> {
        return {
          error: null,
          items: [
            {
              platform: 'TIKTOK',
              externalContentId: 'cc-1',
              creatorExternalId: 'creator-1',
              creatorUsername: 'creator.one',
              publishedAt: new Date('2026-06-01'),
              brandNames: ['Test Brand'],
              label: 'Paid partnership',
              territory: postTerritory,
              videoUrls: [],
              rawPayload: {},
            },
          ],
        };
      },
    };
    const provider: MusicIdentificationProvider = {
      providerName: 'fixed',
      async identify(): Promise<MusicIdentificationResult> {
        return {
          error: null,
          matches: [{ trackId: 't', title: 'T', artist: 'A', isrc: null, confidence: 1, provider: 'fixed', manual: false }],
        };
      },
    };
    return {
      connector,
      musicProvider: provider,
      getRightsRecordsForTrack: async () => [
        {
          id: 'rr-de-only',
          territories: ['DE'],
          commercialUsageAllowed: true,
          organicUsageAllowed: true,
          startDate: new Date('2026-01-01'),
          endDate: null,
          campaignIds: [],
        },
      ],
      getCampaignIdsForCreator: async () => [],
      findCatalogueTrack: inCatalogue,
      creatorExternalId: 'creator-1',
      creatorUsername: 'creator.one',
      creatorCountry,
      since: new Date('2026-01-01'),
      until: new Date('2026-12-31'),
    };
  }

  async function verdict(postTerritory: string | null, creatorCountry: string | null) {
    const [item] = (await runScan(territoryParams(postTerritory, creatorCountry))).items;
    assert.equal(item.kind, 'ASSESSED');
    return item.kind === 'ASSESSED' ? item.assessment : null;
  }

  test("with no territory on the post, the creator's country stands in for it", async () => {
    assert.equal((await verdict(null, 'DE'))?.status, 'CLEARED');
    const outside = await verdict(null, 'US');
    assert.equal(outside?.reason, 'TERRITORY_NOT_COVERED');
    assert.match(outside?.explanation ?? '', /"US", the country on file for this creator/);
  });

  test('with neither, a territory-restricted record stays UNKNOWN', async () => {
    assert.equal((await verdict(null, null))?.status, 'UNKNOWN');
  });

  test("the post's own territory wins over the creator's country", async () => {
    const result = await verdict('FR', 'DE');
    assert.equal(result?.reason, 'TERRITORY_NOT_COVERED');
    assert.match(result?.explanation ?? '', /territory "FR"/);
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
      findCatalogueTrack: inCatalogue,
      creatorExternalId: 'lena.creates',
      creatorUsername: 'lena.creates',
      since: SINCE,
      until: UNTIL,
    });
    assert.equal(result.connectorError, 'TikTok API rate limit exceeded');
    assert.deepEqual(result.items, []);
  });

  test('a content item with no identifiable track is reported as NO_MUSIC_MATCH', async () => {
    const result = await runScan({
      connector: demoConnector(),
      // Always "finds" nothing, regardless of input.
      musicProvider: {
        providerName: 'silent',
        async identify(_input: MusicIdentificationInput): Promise<MusicIdentificationResult> {
          return { matches: [], error: null };
        },
      },
      getRightsRecordsForTrack: async () => [],
      getCampaignIdsForCreator: async () => [],
      findCatalogueTrack: inCatalogue,
      creatorExternalId: 'lena.creates',
      creatorUsername: 'lena.creates',
      since: SINCE,
      until: UNTIL,
    });
    assert.equal(result.items.length, 2);
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
      connector: demoConnector(),
      musicProvider: failingProvider,
      getRightsRecordsForTrack: async () => [],
      getCampaignIdsForCreator: async () => [],
      findCatalogueTrack: inCatalogue,
      creatorExternalId: 'maxstudio',
      creatorUsername: 'maxstudio',
      since: SINCE,
      until: UNTIL,
    });
    assert.equal(result.items.length, 2);
    for (const item of result.items) {
      assert.equal(item.kind, 'MUSIC_ID_ERROR');
      if (item.kind === 'MUSIC_ID_ERROR') {
        assert.equal(item.error, 'fingerprinting service unavailable');
      }
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
      findCatalogueTrack: inCatalogue,
      creatorExternalId: 'creator-1',
      creatorUsername: 'creator.one',
      since: new Date('2000-01-01'),
      until: new Date('2100-01-01'),
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

describe('runScan (catalogue)', () => {
  const oneSongProvider: MusicIdentificationProvider = {
    providerName: 'fixed',
    async identify(): Promise<MusicIdentificationResult> {
      return {
        error: null,
        matches: [{ trackId: 'provider-42', title: 'Paper Planes', artist: 'Juno Vale', isrc: 'DEMO12610001', confidence: 0.9, provider: 'fixed', manual: false }],
      };
    },
  };

  test("a song outside the catalogue is OTHER_MUSIC: kept, and never assessed", async () => {
    const asked: string[] = [];
    const result = await runScan({
      connector: demoConnector(),
      musicProvider: oneSongProvider,
      getRightsRecordsForTrack: async (trackId) => {
        asked.push(trackId);
        return [];
      },
      getCampaignIdsForCreator: async () => [],
      findCatalogueTrack: async () => null,
      creatorExternalId: 'lena.creates',
      creatorUsername: 'lena.creates',
      since: SINCE,
      until: UNTIL,
    });
    assert.deepEqual(result.items.map((item) => item.kind), ['OTHER_MUSIC', 'OTHER_MUSIC']);
    const [first] = result.items;
    if (first.kind === 'OTHER_MUSIC') assert.equal(first.musicMatch.title, 'Paper Planes');
    assert.deepEqual(asked, []);
  });

  test('a catalogue song is assessed under its catalogue id', async () => {
    const asked: string[] = [];
    const result = await runScan({
      connector: demoConnector(),
      musicProvider: oneSongProvider,
      getRightsRecordsForTrack: async (trackId) => {
        asked.push(trackId);
        return [];
      },
      getCampaignIdsForCreator: async () => [],
      findCatalogueTrack: async (match) => (match.isrc === 'DEMO12610001' ? 'catalogue-7' : null),
      creatorExternalId: 'lena.creates',
      creatorUsername: 'lena.creates',
      since: SINCE,
      until: UNTIL,
    });
    assert.ok(result.items.every((item) => item.kind === 'ASSESSED' && item.musicMatch.trackId === 'catalogue-7'));
    assert.deepEqual(asked, ['catalogue-7', 'catalogue-7']);
  });
});
