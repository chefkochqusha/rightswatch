import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MockTikTokConnector } from './mock-connector';

describe('MockTikTokConnector', () => {
  test('returns only items for the requested creator', async () => {
    const connector = new MockTikTokConnector();
    const result = await connector.fetchCommercialContent({
      creatorExternalId: 'demo-creator-1',
      creatorUsername: 'mia.dances',
      since: new Date('2000-01-01'),
      until: new Date('2100-01-01'),
    });
    assert.equal(result.error, null);
    assert.ok(result.items.length > 0);
    assert.ok(result.items.every((item) => item.creatorExternalId === 'demo-creator-1'));
  });

  test('an unknown creator returns an empty result, not an error', async () => {
    const connector = new MockTikTokConnector();
    const result = await connector.fetchCommercialContent({
      creatorExternalId: 'nobody-here',
      creatorUsername: 'nobody',
      since: new Date('2000-01-01'),
      until: new Date('2100-01-01'),
    });
    assert.equal(result.error, null);
    assert.deepEqual(result.items, []);
  });

  test('respects the date window inclusively at both ends', async () => {
    const connector = new MockTikTokConnector();
    // tt-cc-1001 is published exactly at 2025-11-03T14:20:00Z.
    const exact = await connector.fetchCommercialContent({
      creatorExternalId: 'demo-creator-1',
      creatorUsername: 'mia.dances',
      since: new Date('2025-11-03T14:20:00Z'),
      until: new Date('2025-11-03T14:20:00Z'),
    });
    assert.equal(exact.items.length, 1);
    assert.equal(exact.items[0].externalContentId, 'tt-cc-1001');

    const before = await connector.fetchCommercialContent({
      creatorExternalId: 'demo-creator-1',
      creatorUsername: 'mia.dances',
      since: new Date('2025-11-03T14:20:00.001Z'),
      until: new Date('2100-01-01'),
    });
    assert.ok(!before.items.some((item) => item.externalContentId === 'tt-cc-1001'));
  });

  test('every returned item carries the raw payload for audit display', async () => {
    const connector = new MockTikTokConnector();
    const result = await connector.fetchCommercialContent({
      creatorExternalId: 'demo-creator-2',
      creatorUsername: 'leon.fit',
      since: new Date('2000-01-01'),
      until: new Date('2100-01-01'),
    });
    assert.ok(result.items.length > 0);
    for (const item of result.items) {
      assert.equal(item.platform, 'TIKTOK');
      assert.ok(item.rawPayload);
    }
  });
});
