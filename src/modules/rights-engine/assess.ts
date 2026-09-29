import type {
  RightsAssessmentInput,
  RightsAssessmentResult,
  RightsRecordInput,
} from './types';

/**
 * Rights Engine (Master Brief §11).
 *
 * `assessRights()` is pure and deterministic: no network, no database, no
 * clock, no randomness. The same input always produces the same output, so
 * it can be called from a scan-pipeline job, an API route, or a test with
 * identical behavior, and a past assessment can always be recomputed for
 * audit.
 *
 * It checks three independent dimensions, in this fixed priority order,
 * each narrowing the set of RightsRecords still "in scope":
 *
 *   1. term      — was ANY grant window open on the content's publish date?
 *   2. territory — does the content's territory fall inside a covering grant?
 *   3. usage type — does a covering grant allow this usage (commercial/organic)?
 *   4. campaign  — if a grant is campaign-scoped, does it name this campaign?
 *
 * The order matters only for which reason code is reported when nothing
 * survives a stage — term is checked first because "is there even a grant
 * active on this date" is the most fundamental question; campaign is
 * checked last because it is the narrowest, most specific restriction.
 *
 * Territory and campaign share the same shape of question: a record with an
 * empty scope list covers everything, a non-empty list requires a match —
 * but if the *content's* value for that dimension is unknown (TikTok's
 * Commercial Content API does not return a territory at all — Brief §4), a
 * record that would need it can't be confirmed either way. That is
 * genuinely different from a record that explicitly does not cover a known
 * value, so it is its own outcome (UNKNOWN) rather than being folded into
 * POTENTIAL_MISMATCH — and critically, a record with an unrestricted scope
 * still clears normally even when the content's value is unknown, because
 * an unrestricted grant doesn't need to know it (see `classifyByScope`).
 *
 * The engine never concludes anything legal. Every non-CLEARED result is a
 * structured signal for a human (ANALYST/ADMIN) to act on inside a Case.
 */
export function assessRights(
  input: RightsAssessmentInput,
): RightsAssessmentResult {
  // A human's decision on this exact case always wins, immediately and
  // unconditionally — see the comment on `manualOverride` in types.ts.
  if (input.manualOverride) {
    return {
      status: input.manualOverride.status,
      reason: 'MANUAL_REVIEW_REQUIRED',
      matchedRecordIds: [],
      explanation: `Manually set by a reviewer: ${input.manualOverride.note}`,
    };
  }

  const { content, rightsRecords } = input;

  // No rights record at all for this track. This is the strongest possible
  // signal of unlicensed use: a commercial post exists, matched to a track,
  // and the workspace has never recorded a grant for that track at all.
  if (rightsRecords.length === 0) {
    return {
      status: 'POTENTIAL_MISMATCH',
      reason: 'NO_RIGHTS_RECORD',
      matchedRecordIds: [],
      explanation:
        'No rights record exists for the matched track, so no license can be confirmed.',
    };
  }

  // --- Stage 1: term ----------------------------------------------------
  const termActive = rightsRecords.filter((record) =>
    isWithinTerm(record, content.publishedAt),
  );
  if (termActive.length === 0) {
    return {
      status: 'POTENTIAL_MISMATCH',
      reason: 'TERM_EXPIRED',
      matchedRecordIds: rightsRecords.map((r) => r.id),
      explanation:
        'Every rights record on file for this track has a term that does not cover the date this content was published.',
    };
  }

  // --- Stage 2: territory -------------------------------------------------
  const territoryChecks = classifyByScope(
    termActive,
    (r) => r.territories,
    content.territory,
  );
  if (territoryChecks.pass.length === 0) {
    if (territoryChecks.unknown.length > 0) {
      return {
        status: 'UNKNOWN',
        reason: 'MANUAL_REVIEW_REQUIRED',
        matchedRecordIds: territoryChecks.unknown.map((r) => r.id),
        explanation:
          "The content's territory could not be determined, and the rights record(s) that might cover this usage are restricted to specific territories.",
      };
    }
    return {
      status: 'POTENTIAL_MISMATCH',
      reason: 'TERRITORY_NOT_COVERED',
      matchedRecordIds: termActive.map((r) => r.id),
      explanation: `None of the rights records active on the publish date cover the territory "${content.territory ?? 'unknown'}".`,
    };
  }
  const territoryActive = territoryChecks.pass;

  // --- Stage 3: usage type ---------------------------------------------
  // Checked against the *same* territoryActive set so a genuine
  // contradiction (some records allow, some explicitly don't, for the
  // identical track/territory/date) can be told apart from unanimous
  // non-coverage. Unlike territory/campaign, this dimension has no
  // "unknown" case — isCommercialUsage and the allow flags are always
  // definite booleans, never inferred from a missing external field.
  const usageFlags = territoryActive.map((record) =>
    content.isCommercialUsage
      ? record.commercialUsageAllowed
      : record.organicUsageAllowed,
  );
  const anyAllow = usageFlags.some(Boolean);
  const anyDisallow = usageFlags.some((allowed) => !allowed);

  if (!anyAllow) {
    // Unanimous: every in-scope record disallows this usage type.
    return {
      status: 'POTENTIAL_MISMATCH',
      reason: content.isCommercialUsage
        ? 'COMMERCIAL_USAGE_NOT_COVERED'
        : 'USAGE_TYPE_NOT_COVERED',
      matchedRecordIds: territoryActive.map((r) => r.id),
      explanation: content.isCommercialUsage
        ? 'A rights record covers this track, territory and date, but none of them permit commercial (paid-partnership) usage.'
        : 'A rights record covers this track, territory and date, but none of them permit organic usage.',
    };
  }
  if (anyAllow && anyDisallow) {
    // Contradiction: identical scope, opposite answers. The engine cannot
    // resolve which record is authoritative — that is a human call.
    return {
      status: 'REVIEW',
      reason: 'CONFLICTING_RIGHTS_RECORDS',
      matchedRecordIds: territoryActive.map((r) => r.id),
      explanation:
        'Multiple rights records cover this track, territory and date, but disagree on whether this usage type is permitted.',
    };
  }
  const usageTypeActive = territoryActive.filter((_, i) => usageFlags[i]);

  // --- Stage 4: campaign ------------------------------------------------
  const campaignChecks = classifyByScope(
    usageTypeActive,
    (r) => r.campaignIds,
    content.campaignId,
  );
  if (campaignChecks.pass.length === 0) {
    if (campaignChecks.unknown.length > 0) {
      return {
        status: 'UNKNOWN',
        reason: 'MANUAL_REVIEW_REQUIRED',
        matchedRecordIds: campaignChecks.unknown.map((r) => r.id),
        explanation:
          'This content is not linked to a campaign, and the rights record(s) that might cover this usage are scoped to specific campaigns.',
      };
    }
    return {
      status: 'POTENTIAL_MISMATCH',
      reason: 'CAMPAIGN_NOT_COVERED',
      matchedRecordIds: usageTypeActive.map((r) => r.id),
      explanation:
        'The records that otherwise cover this usage are scoped to specific campaigns that do not include this one.',
    };
  }

  const cleared = campaignChecks.pass;
  return {
    status: 'CLEARED',
    reason: null,
    matchedRecordIds: cleared.map((r) => r.id),
    explanation:
      cleared.length === 1
        ? 'A rights record covers this track, territory, date and usage type.'
        : `${cleared.length} rights records cover this track, territory, date and usage type.`,
  };
}

function isWithinTerm(record: RightsRecordInput, publishedAt: Date): boolean {
  if (publishedAt < record.startDate) return false;
  if (record.endDate && publishedAt > record.endDate) return false;
  return true;
}

/**
 * Classifies records against one "scope" dimension (territory or campaign),
 * both of which share the identical shape: an empty list on the record
 * means "covers everything," a non-empty list means "only these," and the
 * content's actual value for that dimension may itself be unknown.
 *
 *  - `pass`    — record is unrestricted, or restricted and matches.
 *  - `unknown` — record is restricted and the content's value is unknown,
 *                so it can neither be confirmed nor ruled out.
 *  - (silently dropped) — record is restricted, the value is known, and it
 *                doesn't match. Only matters when `pass` and `unknown` are
 *                both empty, which is what triggers a NOT_COVERED result.
 */
function classifyByScope<T>(
  records: T[],
  getScopeValues: (record: T) => string[],
  actual: string | null,
): { pass: T[]; unknown: T[] } {
  const pass: T[] = [];
  const unknown: T[] = [];
  for (const record of records) {
    const scopeValues = getScopeValues(record);
    if (scopeValues.length === 0) {
      pass.push(record);
    } else if (actual === null) {
      unknown.push(record);
    } else if (scopeValues.includes(actual)) {
      pass.push(record);
    }
  }
  return { pass, unknown };
}
