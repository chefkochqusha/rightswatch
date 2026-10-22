import type { ConnectorFetchResult, Platform, PlatformConnector } from "./types";

/**
 * A channel with no data source in this mode: demo data has no posts for it
 * (it is all TikTok), so a scan finds nothing there rather than invented
 * posts. Posts on that channel can still be added by hand.
 */
export class EmptyConnector implements PlatformConnector {
  constructor(readonly platform: Platform) {}

  async fetchCommercialContent(): Promise<ConnectorFetchResult> {
    return { items: [], error: null };
  }
}
