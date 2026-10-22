import type { Platform } from "@/modules/connectors/types";
import { DEMO_WORKSPACE_SLUG } from "./demo-constants";

/**
 * Which connectors the app's scans use (Brief §48, §49).
 *
 * `REAL` when at least one platform's credentials are set — TikTok's
 * Commercial Content API or Instagram through Meta's Graph API — and
 * `DEMO_MODE` isn't "true"; otherwise `DEMO`. Nothing else in the app
 * changes between the two (§49: "Only the connector configuration
 * changes"). Everything a scan produces in `DEMO` mode is fictional, so
 * every surface showing scan data labels itself through this (§48: "Clearly
 * label demo mode").
 *
 * In `REAL` mode a platform without credentials is simply not fetched: its
 * creators stay on the watchlist and their posts are added by link, but no
 * scan invents posts for them. Demo data is all TikTok, so in `DEMO` mode
 * Instagram creators' posts are added by link too.
 */
export type ConnectorMode = "DEMO" | "REAL";

type Env = Record<string, string | undefined>;

export function getTikTokCredentials(env: Env = process.env): { clientKey: string; clientSecret: string } | null {
  const clientKey = env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = env.TIKTOK_CLIENT_SECRET?.trim();
  return clientKey && clientSecret ? { clientKey, clientSecret } : null;
}

export interface MetaCredentials {
  /** A long-lived user token or a system user token with the Business
   *  Discovery permissions (`InstagramBusinessDiscoveryConnector`). */
  accessToken: string;
  /** Bekvor's own Instagram professional account id. */
  igUserId: string;
  /** Optional: signs every call with `appsecret_proof`. */
  appSecret: string | null;
  /** Optional: a Graph API version like "v26.0". */
  graphVersion: string | null;
}

export function getMetaCredentials(env: Env = process.env): MetaCredentials | null {
  const accessToken = env.META_ACCESS_TOKEN?.trim();
  const igUserId = env.META_IG_USER_ID?.trim();
  if (!accessToken || !igUserId) return null;
  return {
    accessToken,
    igUserId,
    appSecret: env.META_APP_SECRET?.trim() || null,
    graphVersion: env.META_GRAPH_VERSION?.trim() || null,
  };
}

/** The platforms the app can fetch automatically right now. */
export function connectedPlatforms(env: Env = process.env): Platform[] {
  if (env.DEMO_MODE?.trim().toLowerCase() === "true") return [];
  return [...(getTikTokCredentials(env) ? (["TIKTOK"] as const) : []), ...(getMetaCredentials(env) ? (["INSTAGRAM"] as const) : [])];
}

export function getConnectorMode(env: Env = process.env): ConnectorMode {
  return connectedPlatforms(env).length > 0 ? "REAL" : "DEMO";
}

/**
 * The mode for one workspace. The public demo workspace is always `DEMO`,
 * even once the app itself is connected: its posts are made up, and it must
 * never be scanned against a real account.
 */
export function dataModeFor(workspace: { slug: string }, env: Env = process.env): ConnectorMode {
  return workspace.slug === DEMO_WORKSPACE_SLUG ? "DEMO" : getConnectorMode(env);
}

/** Whether scans of this workspace fetch a platform's posts, or members add
 *  them by link. */
export function fetchesAutomatically(platform: Platform, workspace: { slug: string }, env: Env = process.env): boolean {
  return dataModeFor(workspace, env) === "DEMO" ? platform === "TIKTOK" : connectedPlatforms(env).includes(platform);
}
