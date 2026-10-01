import type { JobRecord, JobStatus } from "./types";

/**
 * The scan job's payload (Brief §21: every job has a payload; §50: a scan
 * reports how far it got — creators, videos checked, matches, new
 * matches). Counts, ids and messages only: it's stored as JSON, and dates
 * wouldn't survive the round trip as dates.
 */

export const SCAN_JOB_TYPE = "scan";

/** One creator's part of a scan — the entries of its monitoring history
 *  (Brief §8). */
export interface ScanJobCreatorResult {
  creatorId: string;
  handle: string;
  /** Commercial posts the connector returned for the scan's window. */
  videos: number;
  /** Of those, posts with a track identified and assessed. */
  matches: number;
  /** Why the connector couldn't fetch this creator (Brief §37: say what
   *  went wrong), or `null`. */
  error: string | null;
}

export interface ScanJobPayload {
  triggeredByUserId: string | null;
  connectorMode: "DEMO" | "REAL";
  /** Creators this scan fetches. */
  creatorsTotal: number;
  /** Monitored creators past the plan's limit, left out (Brief §19). */
  skippedOverLimit: number;
  videosChecked: number;
  matches: number;
  /** Matches no earlier scan had found. */
  newMatches: number;
  casesOpened: number;
  creators: ScanJobCreatorResult[];
}

export function emptyScanPayload(input: {
  triggeredByUserId: string | null;
  connectorMode: "DEMO" | "REAL";
  creatorsTotal: number;
  skippedOverLimit: number;
}): ScanJobPayload {
  return { ...input, videosChecked: 0, matches: 0, newMatches: 0, casesOpened: 0, creators: [] };
}

export interface CreatorScanHistoryEntry {
  jobId: string;
  /** When the scan started (or was created, if it never started). */
  at: Date;
  status: JobStatus;
  /** This creator's part of it; `null` when the scan didn't reach it — it
   *  failed first, or the creator was paused or over the limit then. */
  result: ScanJobCreatorResult | null;
}

/** One creator's line in each of these scans, in the same order. */
export function creatorScanHistory(
  jobs: JobRecord<ScanJobPayload>[],
  creatorId: string,
): CreatorScanHistoryEntry[] {
  return jobs.map((job) => ({
    jobId: job.id,
    at: job.startedAt ?? job.createdAt,
    status: job.status,
    result: job.payload?.creators.find((entry) => entry.creatorId === creatorId) ?? null,
  }));
}
