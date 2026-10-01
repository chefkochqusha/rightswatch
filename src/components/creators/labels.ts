import type { CreatorStatus } from "@/modules/creators";

/** Brief §8's statuses, as the watchlist shows them. */
export const CREATOR_STATUS_LABELS: Record<CreatorStatus, string> = {
  ACTIVE: "Active",
  PENDING: "Pending",
  PAUSED: "Paused",
  ERROR: "Error",
};

/** What each status means, for a tooltip or a line of help text. */
export const CREATOR_STATUS_DESCRIPTIONS: Record<CreatorStatus, string> = {
  ACTIVE: "Monitored. The last scan reached this creator.",
  PENDING: "Monitored, and waiting for its first scan.",
  PAUSED: "Not monitored until it's resumed. Earlier results stay.",
  ERROR: "Monitored, but the last scan couldn't fetch this creator's posts.",
};

const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** 182000 → "182K", 1200000 → "1.2M". */
export function formatFollowers(count: number | null): string {
  return count === null ? "—" : compactNumber.format(count);
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** "DE" → "Germany". */
export function countryName(code: string | null): string {
  if (!code) return "—";
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}
