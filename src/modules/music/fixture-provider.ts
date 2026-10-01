import type {
  MusicIdentificationInput,
  MusicIdentificationProvider,
  MusicIdentificationResult,
} from './types';
import { DEMO_TRACKS } from '../demo-data/catalog';
import { DEMO_IDENTIFICATION_ERROR, demoIdentificationFor } from '../demo-data/content';

/**
 * Demo Mode's stand-in for a real music identification provider (Brief §3,
 * §47). It doesn't analyze `videoUrls`: it answers from the demo dataset
 * (`modules/demo-data`) by content id — a catalogue track, nothing, or a
 * failure — so it never needs network access, through the same
 * `MusicIdentificationProvider` interface a real provider will satisfy.
 *
 * "No track identified" is an empty `matches` array, not an error: it's a
 * normal outcome of music identification. Content it has never heard of
 * gets that answer too.
 */
export class FixtureMusicIdentificationProvider implements MusicIdentificationProvider {
  readonly providerName = 'fixture';
  private readonly salt: string | undefined;

  /** `salt`: the demo dataset's seed, for the same reason the demo
   *  connector takes one (`mock-connector.ts`). */
  constructor(options: { salt?: string } = {}) {
    this.salt = options.salt;
  }

  async identify(
    input: MusicIdentificationInput,
  ): Promise<MusicIdentificationResult> {
    const result = demoIdentificationFor(input.externalContentId, this.salt);
    if (result.kind === 'error') return { matches: [], error: DEMO_IDENTIFICATION_ERROR };
    if (result.kind === 'none') return { matches: [], error: null };

    const track = DEMO_TRACKS[result.track];
    return {
      error: null,
      matches: [
        {
          trackId: track.trackId,
          title: track.title,
          artist: track.artist,
          isrc: track.isrc,
          confidence: result.confidence,
          provider: this.providerName,
          manual: false,
        },
      ],
    };
  }
}
