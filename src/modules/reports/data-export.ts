/**
 * The "give me my data" export (GDPR Art. 15 access and Art. 20 portability):
 * a machine-readable JSON file of what the workspace holds. The loading lives
 * in `app/_lib/workspace-export.ts`; this file holds the parts that are plain
 * functions: the file's shape, the file name, and turning report rows into
 * records.
 */

export type ExportScope = "workspace" | "account";

export const EXPORT_VERSION = 1;

export interface DataExport {
  exportVersion: typeof EXPORT_VERSION;
  generatedAt: string;
  scope: ExportScope;
  /** What is in the file and what is deliberately not. */
  notes: string[];
  [section: string]: unknown;
}

const WORKSPACE_NOTES = [
  "Everything the workspace holds that a person can see in the product: members, creators, songs and rights records, detections, cases and notes, activity log, plan.",
  "Not included: password hashes and session tokens (never exported), payment details (held by Stripe, not by Bekvor), and the raw answers of the TikTok and AudD services.",
  "Detections are the report rows, one per post with a song in it, as in the CSV report for all time.",
];

const ACCOUNT_NOTES = [
  "Your own account data: your profile, your role, the notes you wrote on cases and the activity-log entries you caused.",
  "Not included: password hash and session tokens (never exported). Ask a workspace owner for the workspace export.",
];

export function exportNotes(scope: ExportScope): string[] {
  return scope === "workspace" ? WORKSPACE_NOTES : ACCOUNT_NOTES;
}

/** Report rows (header first) as records keyed by the header. */
export function rowsToRecords(rows: readonly (readonly (string | number | null)[])[]): Record<string, string | number | null>[] {
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((row) => Object.fromEntries(header.map((name, index) => [String(name), row[index] ?? null])));
}

export function exportFileName(scope: ExportScope, workspaceSlug: string, now: Date): string {
  const slug = workspaceSlug.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "workspace";
  return `bekvor-${scope}-data-${slug}-${now.toISOString().slice(0, 10)}.json`;
}

export function parseExportScope(value: unknown): ExportScope {
  return value === "account" ? "account" : "workspace";
}
