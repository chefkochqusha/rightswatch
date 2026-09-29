import type {
  MusicIdentificationInput,
  MusicIdentificationProvider,
  MusicIdentificationResult,
} from './types';
import { FIXTURE_MATCHES_BY_CONTENT_ID } from './fixtures';

/**
 * Demo Mode's stand-in for a real audio-fingerprinting provider (Brief §1,
 * §6). Looks up a fixed match by `externalContentId` instead of analyzing
 * `videoUrls`, so it never needs network access — the same
 * `MusicIdentificationProvider` interface a real ProviderA/ProviderB
 * implementation will satisfy later.
 *
 * Returns an empty `matches` array (not an error) for any content id it
 * doesn't recognize — "no track identified" is a normal, expected outcome
 * of music identification, not a failure.
 */
export class FixtureMusicIdentificationProvider implements MusicIdentificationProvider {
  readonly providerName = 'fixture';

  async identify(
    input: MusicIdentificationInput,
  ): Promise<MusicIdentificationResult> {
    const match = FIXTURE_MATCHES_BY_CONTENT_ID[input.externalContentId];
    return { matches: match ? [match] : [], error: null };
  }
}
