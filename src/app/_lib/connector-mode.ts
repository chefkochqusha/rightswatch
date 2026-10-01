/**
 * Which TikTok connector the app's scans use (Brief §48, §49).
 *
 * `DEMO` until the real TikTok connector exists and its credentials are
 * configured — then `REAL`, and nothing else in the app changes (§49:
 * "Only the connector configuration changes"). Everything a scan produces
 * in `DEMO` mode is fictional, so every surface showing scan data labels
 * itself through this (§48: "Clearly label demo mode").
 */
export type ConnectorMode = "DEMO" | "REAL";

export function getConnectorMode(): ConnectorMode {
  return "DEMO";
}
