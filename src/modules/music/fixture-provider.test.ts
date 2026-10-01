import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FixtureMusicIdentificationProvider } from './fixture-provider';

describe('FixtureMusicIdentificationProvider', () => {
  test("identifies a scenario post's catalogue track", async () => {
    const provider = new FixtureMusicIdentificationProvider();
    const result = await provider.identify({ externalContentId: 'DEMO-V-1001', videoUrls: [] });
    assert.equal(result.error, null);
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].title, 'Midnight Run');
    assert.equal(result.matches[0].artist, 'Aiko');
    assert.equal(result.matches[0].isrc, 'DEMO12600001');
    assert.equal(result.matches[0].confidence, 0.974);
    assert.equal(result.matches[0].manual, false);
  });

  test('"no track identified" is an empty match list, not an error', async () => {
    const provider = new FixtureMusicIdentificationProvider();
    const result = await provider.identify({ externalContentId: 'DEMO-V-5002', videoUrls: [] });
    assert.equal(result.error, null);
    assert.deepEqual(result.matches, []);
  });

  test('a failed identification reports a readable error', async () => {
    const provider = new FixtureMusicIdentificationProvider();
    const result = await provider.identify({ externalContentId: 'DEMO-V-6002', videoUrls: [] });
    assert.deepEqual(result.matches, []);
    assert.match(result.error ?? '', /timed out/);
  });

  test('content that is not demo content identifies as nothing', async () => {
    const provider = new FixtureMusicIdentificationProvider();
    const result = await provider.identify({ externalContentId: 'nonexistent', videoUrls: [] });
    assert.equal(result.error, null);
    assert.deepEqual(result.matches, []);
  });

  test('the same track can be identified in two different posts', async () => {
    const provider = new FixtureMusicIdentificationProvider();
    const a = await provider.identify({ externalContentId: 'DEMO-V-1001', videoUrls: [] });
    const b = await provider.identify({ externalContentId: 'DEMO-V-6003', videoUrls: [] });
    assert.equal(a.matches[0].trackId, b.matches[0].trackId);
  });
});
