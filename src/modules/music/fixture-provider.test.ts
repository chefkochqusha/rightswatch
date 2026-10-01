import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FixtureMusicIdentificationProvider } from './fixture-provider';
import { demoContentFor } from '../demo-data/content';
import { DEMO_TRACKS } from '../demo-data/catalog';

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

  describe("with a workspace's own catalogue", () => {
    // Creators outside the dataset's scenarios: every post is generated.
    const POSTS = ['julia.bakes', 'tom.travels', 'kim.cooks'].flatMap((handle) =>
      demoContentFor(handle, new Date('2026-06-01T00:00:00Z'), new Date('2026-09-30T23:59:59Z')),
    );
    const OWN = { trackId: 'track-own', title: 'Paper Planes', artist: 'Juno Vale', isrc: 'DEMO12610001' };
    const SECOND = { trackId: 'track-second', title: 'Northern Lines', artist: 'Halden', isrc: null };

    async function titles(provider: FixtureMusicIdentificationProvider) {
      return Promise.all(
        POSTS.map(async (post) => (await provider.identify({ externalContentId: post.externalContentId, videoUrls: [] })).matches[0]?.title ?? null),
      );
    }

    test('hears its songs in some generated posts, under the catalogue id it was given', async () => {
      assert.ok(POSTS.length >= 20, 'enough posts to see a rate');
      const provider = new FixtureMusicIdentificationProvider({ catalogue: [OWN] });
      const results = await Promise.all(POSTS.map((post) => provider.identify({ externalContentId: post.externalContentId, videoUrls: [] })));
      const own = results.flatMap((result) => result.matches).filter((match) => match.trackId === 'track-own');
      assert.ok(own.length > POSTS.length / 6 && own.length < POSTS.length / 2, `found in ${own.length} of ${POSTS.length}`);
      for (const match of own) {
        assert.equal(match.isrc, 'DEMO12610001');
        assert.ok(match.confidence >= 0.8 && match.confidence < 0.99);
      }
    });

    test('is deterministic, and a second song never reshuffles the first', async () => {
      const once = await titles(new FixtureMusicIdentificationProvider({ catalogue: [OWN] }));
      assert.deepEqual(await titles(new FixtureMusicIdentificationProvider({ catalogue: [OWN] })), once);

      const both = await titles(new FixtureMusicIdentificationProvider({ catalogue: [OWN, SECOND] }));
      once.forEach((title, index) => {
        // A post that used the first song keeps it, or goes to the new one.
        if (title === 'Paper Planes') assert.ok(['Paper Planes', 'Northern Lines'].includes(both[index] ?? ''), `post ${index}: ${both[index]}`);
      });
      assert.ok(both.includes('Northern Lines'));
      assert.ok(both.filter((title) => title === 'Paper Planes' || title === 'Northern Lines').length >= once.filter((title) => title === 'Paper Planes').length);
    });

    test("leaves scenario posts and the dataset's own songs to the dataset", async () => {
      const withDatasetSongs = new FixtureMusicIdentificationProvider({
        catalogue: Object.values(DEMO_TRACKS).map((track) => ({ ...track, trackId: `ws-${track.trackId}` })),
      });
      assert.deepEqual(await titles(withDatasetSongs), await titles(new FixtureMusicIdentificationProvider()));

      const scenario = await new FixtureMusicIdentificationProvider({ catalogue: [OWN] }).identify({ externalContentId: 'DEMO-V-5002', videoUrls: [] });
      assert.deepEqual(scenario.matches, []);
    });
  });
});
