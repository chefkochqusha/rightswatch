import type {
  ConnectorFetchParams,
  ConnectorFetchResult,
  PlatformConnector,
} from '../types';
import { demoContentFor } from '../../demo-data/content';

/**
 * Demo Mode's stand-in for the real TikTok Commercial Content API (Brief
 * §48, §49). The real connector will implement the exact same
 * `PlatformConnector` interface, so switching from demo to real changes the
 * connector, never anything that consumes its result.
 *
 * Asked the same question the real API answers — a creator's username and
 * a publication-date window (Brief §4) — it returns the demo posts for that
 * username (`modules/demo-data`): the hand-written scenarios for the six
 * creators Brief §62 names, generated posts for anyone else. So a creator a
 * workspace adds itself is scanned like any other.
 *
 * Like the real API, it never returns a post from the future: the window is
 * capped at `now()`. Both it and the dataset's seed are injectable, so a
 * test or Demo Mode's fixed snapshot can pin them.
 */
export class MockTikTokConnector implements PlatformConnector {
  readonly platform = 'TIKTOK' as const;
  private readonly now: () => Date;
  private readonly salt: string | undefined;

  constructor(options: { now?: () => Date; salt?: string } = {}) {
    this.now = options.now ?? (() => new Date());
    this.salt = options.salt;
  }

  async fetchCommercialContent(
    params: ConnectorFetchParams,
  ): Promise<ConnectorFetchResult> {
    const now = this.now();
    const until = params.until < now ? params.until : now;
    const items = demoContentFor(params.creatorUsername, params.since, until, this.salt).map((item) => ({
      ...item,
      // Whatever id the caller tracks this creator under.
      creatorExternalId: params.creatorExternalId,
    }));
    return { items, error: null };
  }
}
