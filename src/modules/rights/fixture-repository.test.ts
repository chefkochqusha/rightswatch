import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FixtureRightsRepository } from './fixture-repository';

describe('FixtureRightsRepository', () => {
  test('returns the records on file for a known track', async () => {
    const repo = new FixtureRightsRepository();
    const records = await repo.getRecordsForTrack('demo-track-1');
    assert.equal(records.length, 1);
    assert.equal(records[0].commercialUsageAllowed, true);
  });

  test('returns an empty array for a track with no rights record', async () => {
    const repo = new FixtureRightsRepository();
    const records = await repo.getRecordsForTrack('demo-track-3');
    assert.deepEqual(records, []);
  });

  test('returns an empty array for a completely unknown track id', async () => {
    const repo = new FixtureRightsRepository();
    const records = await repo.getRecordsForTrack('not-a-real-track');
    assert.deepEqual(records, []);
  });
});
