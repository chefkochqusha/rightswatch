import type { MusicIdentificationInput, MusicIdentificationProvider, MusicIdentificationResult } from './types';

/**
 * What identifies the music in a real post, until an audio recognition
 * service is connected: nothing. TikTok's commercial content data carries no
 * music information (Brief §4), so with no provider there is no honest way
 * to say which song a post uses. Every post comes back "no track
 * identified" — never a guess — and a person can still identify one by hand.
 */
export class NoRecognitionProvider implements MusicIdentificationProvider {
  readonly providerName = 'none';

  async identify(_input: MusicIdentificationInput): Promise<MusicIdentificationResult> {
    return { matches: [], error: null };
  }
}
