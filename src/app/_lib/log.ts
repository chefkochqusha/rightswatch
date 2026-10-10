/**
 * One JSON line per event on stdout/stderr, so `docker compose logs` (or any
 * log collector) can filter by level and event without a monitoring service.
 * Never pass personal data or secrets in `fields`: ids, counts and error
 * messages only.
 */
export type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ at: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
