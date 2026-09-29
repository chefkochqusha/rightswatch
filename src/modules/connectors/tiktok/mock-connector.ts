import type {
  ConnectorFetchParams,
  ConnectorFetchResult,
  PlatformConnector,
} from '../types';
import { FIXTURE_COMMERCIAL_CONTENT } from './fixtures';

/**
 * Demo Mode's stand-in for the real TikTok Commercial Content API (Brief
 * §6, §9). Phase 10's real connector — gated until TikTok access and
 * credentials are confirmed (Brief §4; see ARCHITECTURE.md "Connector
 * architecture" for status) — will implement the exact same
 * `PlatformConnector` interface, so switching from mock to real at any call
 * site is a one-line change, never a change to anything that consumes the
 * result.
 *
 * Returns deterministic fixture data (`./fixtures.ts`) filtered by the same
 * params a real call would take, so it exercises real filtering logic
 * rather than always returning everything.
 */
export class MockTikTokConnector implements PlatformConnector {
  readonly platform = 'TIKTOK' as const;

  async fetchCommercialContent(
    params: ConnectorFetchParams,
  ): Promise<ConnectorFetchResult> {
    const items = FIXTURE_COMMERCIAL_CONTENT.filter(
      (item) =>
        item.creatorExternalId === params.creatorExternalId &&
        item.publishedAt >= params.since &&
        item.publishedAt <= params.until,
    );
    return { items, error: null };
  }
}
