import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FixtureCampaignRepository } from './fixture-repository';

describe('FixtureCampaignRepository', () => {
  test('returns the campaign(s) a known member creator belongs to', async () => {
    const repo = new FixtureCampaignRepository();
    const campaigns = await repo.findForCreator('demo-creator-1');
    assert.equal(campaigns.length, 1);
    assert.equal(campaigns[0].id, 'campaign-summer-launch');
    assert.equal(campaigns[0].name, 'Summer Launch');
  });

  test('returns an empty array for a creator who is not in any campaign', async () => {
    const repo = new FixtureCampaignRepository();
    const campaigns = await repo.findForCreator('demo-creator-2');
    assert.deepEqual(campaigns, []);
  });

  test('returns an empty array for a completely unknown creator id', async () => {
    const repo = new FixtureCampaignRepository();
    const campaigns = await repo.findForCreator('not-a-real-creator');
    assert.deepEqual(campaigns, []);
  });
});
