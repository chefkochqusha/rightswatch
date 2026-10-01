/**
 * When a workspace's next scheduled scan is due (Brief §35, §50), from its
 * plan's `scanCadence` ("daily", "every_6h", "configurable").
 *
 * The scheduler fires on a fixed clock, and a run takes a while, so a
 * "daily" scan started at 04:31 yesterday must still count as due at 04:30
 * today. Each interval is therefore a little shorter than its nominal
 * length. "configurable" (the top plan's own schedule) has no setting yet,
 * so it runs daily.
 */
const HOUR_MS = 3_600_000;

export function scanIntervalMs(cadence: string): number {
  switch (cadence) {
    case "every_6h":
      return 5 * HOUR_MS;
    case "daily":
    case "configurable":
    default:
      return 20 * HOUR_MS;
  }
}

export function isScanDue(input: { cadence: string; lastScanAt: Date | null; now: Date }): boolean {
  if (!input.lastScanAt) return true;
  return input.now.getTime() - input.lastScanAt.getTime() >= scanIntervalMs(input.cadence);
}
