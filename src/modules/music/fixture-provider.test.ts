import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FixtureMusicIdentificationProvider } from './fixture-provider';

describe('FixtureMusicIdentificationProvider', () => {
  test('returns the known match for a recognized content id', async () => {
    const provider = new FixtureMusicIdentificationProvider();
    const result = await provider.identify({
      externalContentId: 'tt-cc-1001',
      videoUrls: [],
    });
    assert.equal(result.error, null);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].title, 'Neon Skyline');
    assert.equal(result.matches[0].manual, false);
  });

  test('returns an empty match list (not an error) for an unrecognized content id', async () => {
    const provider = new FixtureMusicIdentificationProvider();
    const result = await provider.identify({
      externalContentId: 'nonexistent',
      videoUrls: [],
    });
    assert.equal(result.error, null);
    assert.deepEqual(result.matches, []);
  });

  test('the same track can be returned for two different content ids', async () => {
    const provider = new FixtureMusicIdentificationProvider();
    const a = await provider.identify({ externalContentId: 'tt-cc-1001', videoUrls: [] });
    const b = await provider.identify({ externalContentId: 'tt-cc-2002', videoUrls: [] });
    assert.equal(a.matches[0].trackId, b.matches[0].trackId);
  });
});
