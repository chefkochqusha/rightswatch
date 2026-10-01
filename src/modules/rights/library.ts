import { normalizeCountryCode } from "../creators/countries";
import type { RightsRecordInput } from "../rights-engine/types";

/**
 * A workspace's rights records (Master Brief §10): for one catalogue song,
 * what a licence covers — which usage, where, for how long, and for which
 * campaigns. Structured, never a single boolean, so the Rights Engine
 * (§11) can explain exactly what a post falls outside of. Field names
 * mirror `prisma/schema.prisma`'s `RightsRecord`; finer-grained clauses
 * (per platform, paid social vs. creator usage) are `RightsRule`'s job once
 * a real requirement needs them.
 */

export interface RightsRecordRow {
  id: string;
  workspaceId: string;
  trackId: string;
  /** ISO 3166-1 alpha-2 codes. Empty = worldwide. */
  territories: string[];
  /** Covers commercial use: paid partnerships, #ad. */
  commercial: boolean;
  /** Covers organic, unpaid use. */
  organic: boolean;
  startDate: Date;
  /** Inclusive. `null` = open-ended. */
  endDate: Date | null;
  /** Empty = every campaign. */
  campaignIds: string[];
  notes: string | null;
  /** Where the record comes from — an agreement number, a counterparty. */
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** What a member decides about a record; everything else is bookkeeping. */
export type RightsRecordValues = Pick<
  RightsRecordRow,
  "territories" | "commercial" | "organic" | "startDate" | "endDate" | "campaignIds" | "notes" | "source"
>;

export interface RightsRecordRepository {
  /** One song's records, earliest start first. Scoped by workspace. */
  findForTrack(workspaceId: string, trackId: string): Promise<RightsRecordRow[]>;
  /** Every record in the workspace, for summaries across the catalogue. */
  findForWorkspace(workspaceId: string): Promise<RightsRecordRow[]>;
  findById(workspaceId: string, id: string): Promise<RightsRecordRow | null>;
  create(input: RightsRecordValues & { workspaceId: string; trackId: string }): Promise<RightsRecordRow>;
  update(id: string, values: RightsRecordValues): Promise<RightsRecordRow>;
  delete(id: string): Promise<void>;
}

/** The Rights Engine's view of a record. */
export function toRightsRecordInput(row: RightsRecordRow): RightsRecordInput {
  return {
    id: row.id,
    territories: row.territories,
    commercialUsageAllowed: row.commercial,
    organicUsageAllowed: row.organic,
    startDate: row.startDate,
    endDate: row.endDate,
    campaignIds: row.campaignIds,
  };
}

// ---------------------------------------------------------------------------
// The rights record form
// ---------------------------------------------------------------------------

export interface RightsRecordForm {
  commercial: boolean;
  organic: boolean;
  /** "worldwide", or "listed" with `territories`. */
  territoryScope: string;
  /** "DE, AT, CH" — commas or spaces between codes. */
  territories: string;
  /** YYYY-MM-DD, as a date input sends it. */
  startDate: string;
  /** YYYY-MM-DD, or empty for open-ended. */
  endDate: string;
  /** "all", or "listed" with `campaignIds`. */
  campaignScope: string;
  campaignIds: string[];
  notes: string;
  source: string;
}

export type RightsRecordField = "usage" | "territories" | "startDate" | "endDate" | "campaigns" | "notes" | "source";

export type RightsRecordFormResult =
  | { ok: true; values: RightsRecordValues }
  | { ok: false; errors: Partial<Record<RightsRecordField, string>> };

const MAX_NOTES_LENGTH = 2000;
const MAX_SOURCE_LENGTH = 200;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Checks a rights record as a member entered it. `knownCampaignIds` are the
 * workspace's own campaigns — a record can't be scoped to anyone else's.
 * Messages are the form's own wording (Brief §37: human-readable).
 */
export function parseRightsRecordForm(form: RightsRecordForm, knownCampaignIds: readonly string[]): RightsRecordFormResult {
  const errors: Partial<Record<RightsRecordField, string>> = {};

  if (!form.commercial && !form.organic) {
    errors.usage = "Choose at least one kind of use the licence covers.";
  }

  let territories: string[] = [];
  if (form.territoryScope === "listed") {
    const entered = form.territories.split(/[\s,;]+/).filter(Boolean);
    const invalid = entered.filter((code) => normalizeCountryCode(code) === null);
    territories = [...new Set(entered.map((code) => normalizeCountryCode(code)).filter((code): code is string => code !== null))];
    if (invalid.length > 0) {
      errors.territories = `${invalid.map((code) => `“${code}”`).join(", ")} ${invalid.length === 1 ? "isn't a country code" : "aren't country codes"}. Use two-letter codes like DE, AT, CH.`;
    } else if (territories.length === 0) {
      errors.territories = "Enter the countries the licence covers, like DE, AT, CH.";
    }
  }

  const startDate = parseDay(form.startDate, "start");
  if (!form.startDate.trim()) errors.startDate = "Enter the date the licence starts.";
  else if (!startDate) errors.startDate = "Enter a real date.";

  let endDate: Date | null = null;
  if (form.endDate.trim()) {
    endDate = parseDay(form.endDate, "end");
    if (!endDate) errors.endDate = "Enter a real date, or leave it empty for no end date.";
    else if (startDate && endDate < startDate) errors.endDate = "The end date can't be before the start date.";
  }

  let campaignIds: string[] = [];
  if (form.campaignScope === "listed") {
    campaignIds = [...new Set(form.campaignIds.filter(Boolean))];
    if (campaignIds.length === 0) errors.campaigns = "Choose the campaigns the licence covers.";
    else if (campaignIds.some((id) => !knownCampaignIds.includes(id))) errors.campaigns = "Choose campaigns from this workspace.";
  }

  const notes = form.notes.trim() || null;
  if (notes && notes.length > MAX_NOTES_LENGTH) errors.notes = `Keep notes under ${MAX_NOTES_LENGTH} characters.`;
  const source = form.source.trim() || null;
  if (source && source.length > MAX_SOURCE_LENGTH) errors.source = `Keep the source under ${MAX_SOURCE_LENGTH} characters.`;

  if (Object.keys(errors).length > 0 || !startDate) return { ok: false, errors };
  return {
    ok: true,
    values: { territories, commercial: form.commercial, organic: form.organic, startDate, endDate, campaignIds, notes, source },
  };
}

/** A day as a moment: its first millisecond for a start date, its last for
 *  an end date — a licence that ends on the 22nd covers the 22nd. UTC, like
 *  every date the engine compares. */
function parseDay(input: string, edge: "start" | "end"): Date | null {
  const match = DATE_PATTERN.exec(input.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 1900 || year > 2200) return null;
  return edge === "start" ? date : new Date(date.getTime() + 86_400_000 - 1);
}

/** A stored date back as the form's YYYY-MM-DD. */
export function toFormDay(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}
