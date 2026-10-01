import type { RightsRecordRow } from "@/modules/rights";
import { countryName } from "@/components/creators/labels";

/**
 * A rights record in words (Brief §10): what it covers, where, and when —
 * the same wording on the song page, in the catalogue list, and wherever a
 * verdict points back at the record it rests on. Pure, so it's testable.
 */

const day = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function describeUsage(record: Pick<RightsRecordRow, "commercial" | "organic">): string {
  if (record.commercial && record.organic) return "Commercial and organic use";
  if (record.commercial) return "Commercial use only";
  return "Organic use only";
}

export function describeTerritory(record: Pick<RightsRecordRow, "territories">): string {
  if (record.territories.length === 0) return "Worldwide";
  const names = record.territories.map((code) => countryName(code));
  return names.length <= 4 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

export function describeTerm(record: Pick<RightsRecordRow, "startDate" | "endDate">): string {
  return record.endDate
    ? `${day.format(record.startDate)} to ${day.format(record.endDate)}`
    : `From ${day.format(record.startDate)}, no end date`;
}

export type RecordState = "IN_FORCE" | "ENDED" | "NOT_STARTED";

export function recordState(record: Pick<RightsRecordRow, "startDate" | "endDate">, now: Date): RecordState {
  if (record.startDate > now) return "NOT_STARTED";
  if (record.endDate && record.endDate < now) return "ENDED";
  return "IN_FORCE";
}

export const RECORD_STATE_LABELS: Record<RecordState, string> = {
  IN_FORCE: "In force",
  ENDED: "Ended",
  NOT_STARTED: "Not started yet",
};

/**
 * One line for a song in the catalogue list: what its records add up to
 * today, or that there are none — the one thing a scan can't work around.
 */
export function songRightsSummary(records: RightsRecordRow[], now: Date): { text: string; missing: boolean } {
  if (records.length === 0) return { text: "No rights record", missing: true };
  const current = records.filter((record) => recordState(record, now) === "IN_FORCE");
  if (current.length === 0) {
    const ended = records.every((record) => recordState(record, now) === "ENDED");
    return { text: ended ? "Every record has ended" : "No record in force yet", missing: true };
  }
  if (current.length > 1) return { text: `${current.length} records in force`, missing: false };
  const [record] = current;
  const usage = record.commercial ? (record.organic ? "commercial and organic" : "commercial only") : "organic only";
  const scope = record.campaignIds.length > 0 ? `, ${record.campaignIds.length === 1 ? "one campaign" : `${record.campaignIds.length} campaigns`}` : "";
  return { text: `${describeTerritory(record)}, ${usage}${scope}`, missing: false };
}
