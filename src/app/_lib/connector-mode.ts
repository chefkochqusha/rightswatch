import { DEMO_WORKSPACE_SLUG } from "./demo-constants";

/**
 * Which TikTok connector the app's scans use (Brief §48, §49).
 *
 * `REAL` only when both TikTok credentials are set and `DEMO_MODE` isn't
 * "true"; otherwise `DEMO`. Nothing else in the app changes between the two
 * (§49: "Only the connector configuration changes"). Everything a scan
 * produces in `DEMO` mode is fictional, so every surface showing scan data
 * labels itself through this (§48: "Clearly label demo mode").
 */
export type ConnectorMode = "DEMO" | "REAL";

export function getTikTokCredentials(env: Record<string, string | undefined> = process.env): { clientKey: string; clientSecret: string } | null {
  const clientKey = env.TIKTOK_CLIENT_KEY?.trim();
  const clientSecret = env.TIKTOK_CLIENT_SECRET?.trim();
  return clientKey && clientSecret ? { clientKey, clientSecret } : null;
}

export function getConnectorMode(env: Record<string, string | undefined> = process.env): ConnectorMode {
  if (env.DEMO_MODE?.trim().toLowerCase() === "true") return "DEMO";
  return getTikTokCredentials(env) ? "REAL" : "DEMO";
}

/**
 * The mode for one workspace. The public demo workspace is always `DEMO`,
 * even once the app itself is connected to TikTok: its posts are made up,
 * and it must never be scanned against a real account.
 */
export function dataModeFor(workspace: { slug: string }, env: Record<string, string | undefined> = process.env): ConnectorMode {
  return workspace.slug === DEMO_WORKSPACE_SLUG ? "DEMO" : getConnectorMode(env);
}
