import type { MusicIdentificationInput, MusicIdentificationProvider, MusicIdentificationResult } from "./types";

/**
 * A spending cap around a paid recognition service. Every post sent to it
 * costs money, so one scan may send at most `maxPosts`; the rest come back as
 * "not identified this time" (an error the creator's page shows) and are tried
 * again by the next scan. A bug, a huge watchlist or a creator with thousands
 * of posts can therefore cost at most `maxPosts` requests per scan, never an
 * unbounded bill. Posts with no video link cost nothing and don't count.
 */
export class BudgetedRecognitionProvider implements MusicIdentificationProvider {
  private used = 0;

  constructor(
    private readonly inner: MusicIdentificationProvider,
    private readonly maxPosts: number,
  ) {}

  get providerName(): string {
    return this.inner.providerName;
  }

  async identify(input: MusicIdentificationInput): Promise<MusicIdentificationResult> {
    if (input.videoUrls.length === 0) return this.inner.identify(input);
    if (this.used >= this.maxPosts) {
      return {
        matches: [],
        error: `Song recognition limit for one scan reached (${this.maxPosts} posts). This post is checked in the next scan.`,
      };
    }
    this.used += 1;
    return this.inner.identify(input);
  }
}
