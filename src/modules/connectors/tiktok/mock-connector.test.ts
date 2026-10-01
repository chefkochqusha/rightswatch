import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MockTikTokConnector } from './mock-connector';

const SEPTEMBER = { since: new Date('2026-09-01T00:00:00Z'), until: new Date('2026-09-30T23:59:59Z') };
// Pinned clock: a demo connector never returns a post from the future, so
// tests that ask about September pretend it's the end of September.
const endOfSeptember = () => new Date('2026-09-30T23:59:59Z');

describe('MockTikTokConnector', () => {
  test("returns a named creator's scenario posts for the window, oldest first", async () => {
    const connector = new MockTikTokConnector({ now: endOfSeptember });
    const result = await connector.fetchCommercialContent({
      creatorExternalId: 'creator-row-1',
      creatorUsername: 'lena.creates',
      ...SEPTEMBER,
    });
    assert.equal(result.error, null);
    assert.deepEqual(
      result.items.map((item) => item.externalContentId),
      ['DEMO-V-1002', 'DEMO-V-1001'],
    );
    // The caller's own id for the creator comes back on every item.
    assert.ok(result.items.every((item) => item.creatorExternalId === 'creator-row-1'));
    assert.ok(result.items.every((item) => item.creatorUsername === 'lena.creates'));
  });

  test('matches the username case-insensitively, as TikTok does', async () => {
    const connector = new MockTikTokConnector({ now: endOfSeptember });
    const result = await connector.fetchCommercialContent({
      creatorExternalId: 'x',
      creatorUsername: 'Lena.Creates',
      ...SEPTEMBER,
    });
    assert.equal(result.items.length, 2);
  });

  test("a username nobody hand-wrote gets generated posts, the same ones every time", async () => {
    const connector = new MockTikTokConnector({ now: endOfSeptember });
    const params = { creatorExternalId: 'x', creatorUsername: 'someone.new', ...SEPTEMBER };
    const first = await connector.fetchCommercialContent(params);
    const second = await connector.fetchCommercialContent(params);
    assert.equal(first.error, null);
    assert.ok(first.items.length > 0, 'expected at least one post in a month');
    assert.deepEqual(JSON.stringify(first.items), JSON.stringify(second.items));

    const other = await connector.fetchCommercialContent({ ...params, creatorUsername: 'someone.else' });
    assert.notDeepEqual(
      other.items.map((item) => item.externalContentId),
      first.items.map((item) => item.externalContentId),
    );
  });

  test('respects the date window inclusively at both ends', async () => {
    const connector = new MockTikTokConnector({ now: endOfSeptember });
    // DEMO-V-1001 is published exactly at 2026-09-27T16:40:00Z.
    const at = new Date('2026-09-27T16:40:00Z');
    const exact = await connector.fetchCommercialContent({
      creatorExternalId: 'x',
      creatorUsername: 'lena.creates',
      since: at,
      until: at,
    });
    assert.deepEqual(exact.items.map((item) => item.externalContentId), ['DEMO-V-1001']);

    const after = await connector.fetchCommercialContent({
      creatorExternalId: 'x',
      creatorUsername: 'lena.creates',
      since: new Date(at.getTime() + 1),
      until: endOfSeptember(),
    });
    assert.ok(!after.items.some((item) => item.externalContentId === 'DEMO-V-1001'));
  });

  test('never returns a post from the future, whatever window is asked for', async () => {
    const connector = new MockTikTokConnector({ now: () => new Date('2026-09-20T00:00:00Z') });
    const result = await connector.fetchCommercialContent({
      creatorExternalId: 'x',
      creatorUsername: 'lena.creates',
      since: new Date('2026-01-01T00:00:00Z'),
      until: new Date('2100-01-01T00:00:00Z'),
    });
    assert.deepEqual(result.items.map((item) => item.externalContentId), ['DEMO-V-1002']);
  });

  test('the raw payload carries only the documented Commercial Content API fields', async () => {
    const connector = new MockTikTokConnector({ now: endOfSeptember });
    const result = await connector.fetchCommercialContent({
      creatorExternalId: 'x',
      creatorUsername: 'maxstudio',
      ...SEPTEMBER,
    });
    assert.ok(result.items.length > 0);
    for (const item of result.items) {
      assert.equal(item.platform, 'TIKTOK');
      assert.deepEqual(Object.keys(item.rawPayload as object).sort(), [
        'brand_names',
        'create_date',
        'create_timestamp',
        'creator',
        'id',
        'label',
        'videos',
      ]);
      // TikTok's API reports no territory, so neither does the demo.
      assert.equal(item.territory, null);
    }
  });
});
