import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FixtureCampaignRepository } from './fixture-repository';

describe('FixtureCampaignRepository', () => {
  test('returns the campaign a member creator is signed to', async () => {
    const repo = new FixtureCampaignRepository();
    const campaigns = await repo.findForCreator('lena.creates');
    assert.equal(campaigns.length, 1);
    assert.equal(campaigns[0].id, 'demo-campaign-nordhaus-autumn');
    assert.equal(campaigns[0].name, 'NordHaus Autumn');
  });

  test('matches the username case-insensitively', async () => {
    const repo = new FixtureCampaignRepository();
    assert.equal((await repo.findForCreator('TheUrbanEdit')).length, 1);
  });

  test('returns an empty array for a creator who is not in any campaign', async () => {
    const repo = new FixtureCampaignRepository();
    assert.deepEqual(await repo.findForCreator('danbuilds'), []);
  });

  test('returns an empty array for a completely unknown creator', async () => {
    const repo = new FixtureCampaignRepository();
    assert.deepEqual(await repo.findForCreator('not-a-real-creator'), []);
  });
});
