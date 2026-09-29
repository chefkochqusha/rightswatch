import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assessRights } from './assess';
import type { RightsAssessmentInput, RightsRecordInput } from './types';

/** A record that covers everything, unless overridden per-test. */
function baseRecord(overrides: Partial<RightsRecordInput> = {}): RightsRecordInput {
  return {
    id: 'rec-1',
    territories: [],
    commercialUsageAllowed: true,
    organicUsageAllowed: true,
    startDate: new Date('2025-01-01'),
    endDate: null,
    campaignIds: [],
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<RightsAssessmentInput['content']> = {},
  rightsRecords: RightsRecordInput[] = [baseRecord()],
): RightsAssessmentInput {
  return {
    content: {
      publishedAt: new Date('2025-06-15'),
      territory: 'DE',
      isCommercialUsage: true,
      campaignId: null,
      ...overrides,
    },
    rightsRecords,
  };
}

describe('assessRights', () => {
  test('manual override always wins, regardless of records', () => {
    const result = assessRights({
      ...baseInput(),
      rightsRecords: [],
      manualOverride: { status: 'CLEARED', note: 'Confirmed licensed by legal.' },
    });
    assert.equal(result.status, 'CLEARED');
    assert.equal(result.reason, 'MANUAL_REVIEW_REQUIRED');
    assert.match(result.explanation, /Confirmed licensed by legal\./);
  });

  test('no rights record at all -> POTENTIAL_MISMATCH / NO_RIGHTS_RECORD', () => {
    const result = assessRights(baseInput({}, []));
    assert.equal(result.status, 'POTENTIAL_MISMATCH');
    assert.equal(result.reason, 'NO_RIGHTS_RECORD');
    assert.deepEqual(result.matchedRecordIds, []);
  });

  test('missing territory with a territory-restricted record -> UNKNOWN / MANUAL_REVIEW_REQUIRED', () => {
    const result = assessRights(
      baseInput({ territory: null }, [baseRecord({ territories: ['DE'] })]),
    );
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.reason, 'MANUAL_REVIEW_REQUIRED');
  });

  test('missing territory with a worldwide record -> CLEARED anyway', () => {
    // This is the common real-world case: TikTok's Commercial Content API
    // does not return a territory at all (Brief §4). A worldwide grant
    // doesn't need to know the territory, so it must not be penalized for
    // TikTok's missing field.
    const result = assessRights(
      baseInput({ territory: null }, [baseRecord({ territories: [] })]),
    );
    assert.equal(result.status, 'CLEARED');
    assert.equal(result.reason, null);
  });

  test('missing territory: a worldwide record clears even alongside an ambiguous restricted one', () => {
    const result = assessRights(
      baseInput({ territory: null }, [
        baseRecord({ id: 'worldwide', territories: [] }),
        baseRecord({ id: 'de-only', territories: ['DE'] }),
      ]),
    );
    assert.equal(result.status, 'CLEARED');
    assert.deepEqual(result.matchedRecordIds, ['worldwide']);
  });

  test('publish date before every record start -> TERM_EXPIRED', () => {
    const result = assessRights(
      baseInput(
        { publishedAt: new Date('2024-01-01') },
        [baseRecord({ startDate: new Date('2025-01-01') })],
      ),
    );
    assert.equal(result.status, 'POTENTIAL_MISMATCH');
    assert.equal(result.reason, 'TERM_EXPIRED');
    assert.deepEqual(result.matchedRecordIds, ['rec-1']);
  });

  test('publish date after every record end -> TERM_EXPIRED', () => {
    const result = assessRights(
      baseInput(
        { publishedAt: new Date('2026-01-01') },
        [baseRecord({ startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31') })],
      ),
    );
    assert.equal(result.status, 'POTENTIAL_MISMATCH');
    assert.equal(result.reason, 'TERM_EXPIRED');
  });

  test('open-ended record (endDate null) covers a far-future publish date', () => {
    const result = assessRights(
      baseInput(
        { publishedAt: new Date('2030-01-01') },
        [baseRecord({ startDate: new Date('2025-01-01'), endDate: null })],
      ),
    );
    assert.equal(result.status, 'CLEARED');
  });

  test('territory not in the covering list -> TERRITORY_NOT_COVERED', () => {
    const result = assessRights(
      baseInput({ territory: 'FR' }, [baseRecord({ territories: ['DE', 'AT'] })]),
    );
    assert.equal(result.status, 'POTENTIAL_MISMATCH');
    assert.equal(result.reason, 'TERRITORY_NOT_COVERED');
  });

  test('empty territories array means worldwide', () => {
    const result = assessRights(baseInput({ territory: 'JP' }, [baseRecord({ territories: [] })]));
    assert.equal(result.status, 'CLEARED');
  });

  test('commercial usage disallowed on every in-scope record -> COMMERCIAL_USAGE_NOT_COVERED', () => {
    const result = assessRights(
      baseInput({ isCommercialUsage: true }, [baseRecord({ commercialUsageAllowed: false })]),
    );
    assert.equal(result.status, 'POTENTIAL_MISMATCH');
    assert.equal(result.reason, 'COMMERCIAL_USAGE_NOT_COVERED');
  });

  test('organic usage disallowed on every in-scope record -> USAGE_TYPE_NOT_COVERED', () => {
    const result = assessRights(
      baseInput({ isCommercialUsage: false }, [baseRecord({ organicUsageAllowed: false })]),
    );
    assert.equal(result.status, 'POTENTIAL_MISMATCH');
    assert.equal(result.reason, 'USAGE_TYPE_NOT_COVERED');
  });

  test('two in-scope records disagree on commercial usage -> CONFLICTING_RIGHTS_RECORDS / REVIEW', () => {
    const result = assessRights(
      baseInput({ isCommercialUsage: true }, [
        baseRecord({ id: 'rec-allow', commercialUsageAllowed: true }),
        baseRecord({ id: 'rec-deny', commercialUsageAllowed: false }),
      ]),
    );
    assert.equal(result.status, 'REVIEW');
    assert.equal(result.reason, 'CONFLICTING_RIGHTS_RECORDS');
    assert.deepEqual(result.matchedRecordIds.sort(), ['rec-allow', 'rec-deny']);
  });

  test('campaign-scoped record that excludes this campaign -> CAMPAIGN_NOT_COVERED', () => {
    const result = assessRights(
      baseInput({ campaignId: 'camp-2' }, [baseRecord({ campaignIds: ['camp-1'] })]),
    );
    assert.equal(result.status, 'POTENTIAL_MISMATCH');
    assert.equal(result.reason, 'CAMPAIGN_NOT_COVERED');
  });

  test('campaign-scoped record with unknown content campaign -> UNKNOWN, not a clean mismatch', () => {
    const result = assessRights(
      baseInput({ campaignId: null }, [baseRecord({ campaignIds: ['camp-1'] })]),
    );
    assert.equal(result.status, 'UNKNOWN');
    assert.equal(result.reason, 'MANUAL_REVIEW_REQUIRED');
  });

  test('empty campaignIds array means every campaign', () => {
    const result = assessRights(
      baseInput({ campaignId: 'camp-anything' }, [baseRecord({ campaignIds: [] })]),
    );
    assert.equal(result.status, 'CLEARED');
  });

  test('campaign-scoped record that includes this campaign -> CLEARED', () => {
    const result = assessRights(
      baseInput({ campaignId: 'camp-1' }, [baseRecord({ campaignIds: ['camp-1', 'camp-2'] })]),
    );
    assert.equal(result.status, 'CLEARED');
    assert.equal(result.reason, null);
  });

  test('fully clean single record -> CLEARED with null reason', () => {
    const result = assessRights(baseInput());
    assert.equal(result.status, 'CLEARED');
    assert.equal(result.reason, null);
    assert.deepEqual(result.matchedRecordIds, ['rec-1']);
  });

  test('multiple non-conflicting overlapping records both survive to CLEARED', () => {
    const result = assessRights(
      baseInput({ territory: 'DE' }, [
        baseRecord({ id: 'worldwide', territories: [] }),
        baseRecord({ id: 'de-specific', territories: ['DE'] }),
      ]),
    );
    assert.equal(result.status, 'CLEARED');
    assert.deepEqual(result.matchedRecordIds.sort(), ['de-specific', 'worldwide']);
  });

  test('term check takes priority over territory when both would fail', () => {
    // A record that fails BOTH term and territory should surface as
    // TERM_EXPIRED, not TERRITORY_NOT_COVERED (term is checked first).
    const result = assessRights(
      baseInput(
        { publishedAt: new Date('2020-01-01'), territory: 'FR' },
        [baseRecord({ startDate: new Date('2025-01-01'), territories: ['DE'] })],
      ),
    );
    assert.equal(result.reason, 'TERM_EXPIRED');
  });
});
