import { assessRights } from '../rights-engine/assess';
import type { RunScanParams, ScanItemResult, ScanResult } from './types';

/**
 * Runs one scan over a single creator's commercial content and produces a
 * rights assessment for every piece of content a track could be identified
 * for (Brief §8, §21). See types.ts for the full pipeline-stage rationale.
 */
export async function runScan(params: RunScanParams): Promise<ScanResult> {
  const fetchResult = await params.connector.fetchCommercialContent({
    creatorExternalId: params.creatorExternalId,
    creatorUsername: params.creatorUsername,
    since: params.since,
    until: params.until,
  });

  if (fetchResult.error) {
    return { connectorError: fetchResult.error, items: [] };
  }

  // Campaign membership is a per-creator fact, not a per-content one (a
  // creator either is or isn't signed to a campaign regardless of which
  // piece of content is being assessed), so it's resolved once per scan
  // rather than once per item.
  //
  // The Rights Engine's input models a single `campaignId | null` per piece
  // of content, but a creator can genuinely belong to more than one
  // campaign at once (`Campaign.creators` is many-to-many). Only the
  // unambiguous case — exactly one campaign — can be reduced to a single
  // id; zero or multiple campaigns fall back to `null`. That's still a
  // correct, meaningful input, not a cop-out: a campaign-unscoped rights
  // record clears normally regardless, and a campaign-scoped one correctly
  // routes to UNKNOWN for a human to confirm rather than this pipeline
  // guessing which of several campaigns is the relevant one (see
  // `classifyByScope` in rights-engine/assess.ts).
  const campaignIds = await params.getCampaignIdsForCreator(params.creatorExternalId);
  const campaignId = campaignIds.length === 1 ? campaignIds[0] : null;

  const items: ScanItemResult[] = [];

  for (const content of fetchResult.items) {
    const idResult = await params.musicProvider.identify({
      externalContentId: content.externalContentId,
      videoUrls: content.videoUrls,
    });

    if (idResult.error) {
      items.push({ kind: 'MUSIC_ID_ERROR', content, error: idResult.error });
      continue;
    }

    // Providers return candidates ordered highest-confidence first; the
    // pipeline acts on the top one. A future version may want to carry
    // runner-up candidates into the Case for an analyst to compare, but
    // that's a UI/Case-shape decision, not a rights-engine one.
    const bestMatch = idResult.matches[0];
    if (!bestMatch) {
      items.push({ kind: 'NO_MUSIC_MATCH', content });
      continue;
    }

    const rightsRecords = await params.getRightsRecordsForTrack(bestMatch.trackId);

    // The post's own territory when the platform reports one; otherwise the
    // creator's country, labeled as such in the explanation.
    const creatorCountry = params.creatorCountry ?? null;
    const assessment = assessRights({
      content: {
        publishedAt: content.publishedAt,
        territory: content.territory ?? creatorCountry,
        territorySource: content.territory === null && creatorCountry !== null ? 'creator' : 'content',
        // Every item this pipeline sees comes from a commercial-content
        // fetch (paid partnership / #ad) by construction — see the
        // `isCommercialUsage` comment in rights-engine/types.ts.
        isCommercialUsage: true,
        campaignId,
      },
      rightsRecords,
    });

    items.push({ kind: 'ASSESSED', content, musicMatch: bestMatch, assessment });
  }

  return { connectorError: null, items };
}
