import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FixtureRightsRepository } from './fixture-repository';

describe('FixtureRightsRepository', () => {
  test('returns the records on file for a known track', async () => {
    const repo = new FixtureRightsRepository();
    const records = await repo.getRecordsForTrack('demo-track-midnight-run');
    assert.equal(records.length, 1);
    assert.equal(records[0].commercialUsageAllowed, true);
  });

  test("carries Brief §10's own example record for Golden Hour", async () => {
    const repo = new FixtureRightsRepository();
    const [record] = await repo.getRecordsForTrack('demo-track-golden-hour');
    assert.deepEqual(record.territories, ['DE', 'AT', 'CH']);
    assert.equal(record.commercialUsageAllowed, false);
    assert.equal(record.organicUsageAllowed, true);
  });

  test('returns an empty array for a track with no rights record', async () => {
    const repo = new FixtureRightsRepository();
    assert.deepEqual(await repo.getRecordsForTrack('demo-track-city-lights'), []);
  });

  test('returns an empty array for a completely unknown track id', async () => {
    const repo = new FixtureRightsRepository();
    assert.deepEqual(await repo.getRecordsForTrack('not-a-real-track'), []);
  });
});
