import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeDemoSnapshot } from './demo-snapshot';

describe('the demo snapshot (Brief §48, §62)', () => {
  test("lands exactly on Brief §48's numbers", async () => {
    // If this fails after a change to the demo dataset, run
    // `npx tsx scripts/demo-data/find-salt.ts` and update DEMO_SALT.
    const { counts } = await computeDemoSnapshot();
    assert.deepEqual(counts, {
      monitoredCreators: 48,
      videos: 186,
      musicMatches: 27,
      openCases: 11,
      newMatches: 7,
    });
  });

  test('every scenario reaches the verdict it was written for', async () => {
    const { items } = await computeDemoSnapshot();
    const verdicts = Object.fromEntries(
      items
        .filter((item) => !item.content.externalContentId.startsWith('DEMO-V-G'))
        .map((item) => [
          item.content.externalContentId,
          item.kind === 'ASSESSED' ? `${item.assessment.status} ${item.assessment.reason ?? ''}`.trim() : item.kind,
        ]),
    );
    assert.deepEqual(verdicts, {
      'DEMO-V-1001': 'CLEARED',
      'DEMO-V-1002': 'CLEARED',
      'DEMO-V-2001': 'POTENTIAL_MISMATCH COMMERCIAL_USAGE_NOT_COVERED',
      'DEMO-V-2002': 'POTENTIAL_MISMATCH TERM_EXPIRED',
      'DEMO-V-3001': 'POTENTIAL_MISMATCH COMMERCIAL_USAGE_NOT_COVERED',
      'DEMO-V-3002': 'REVIEW CONFLICTING_RIGHTS_RECORDS',
      'DEMO-V-3003': 'POTENTIAL_MISMATCH CAMPAIGN_NOT_COVERED',
      'DEMO-V-4001': 'CLEARED',
      'DEMO-V-4002': 'POTENTIAL_MISMATCH TERM_EXPIRED',
      'DEMO-V-4003': 'POTENTIAL_MISMATCH TERRITORY_NOT_COVERED',
      'DEMO-V-5001': 'UNKNOWN MANUAL_REVIEW_REQUIRED',
      'DEMO-V-5002': 'NO_MUSIC_MATCH',
      'DEMO-V-6001': 'POTENTIAL_MISMATCH NO_RIGHTS_RECORD',
      'DEMO-V-6002': 'MUSIC_ID_ERROR',
      'DEMO-V-6003': 'CLEARED',
    });
  });

  test('is the same on every run', async () => {
    const a = await computeDemoSnapshot();
    const b = await computeDemoSnapshot();
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });
});
