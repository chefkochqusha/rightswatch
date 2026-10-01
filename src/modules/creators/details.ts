import { normalizeCountryCode } from "./countries";

/**
 * The optional details a member can enter for a creator (Brief §8: display
 * name, country, followers), as they arrive from a form — strings, possibly
 * empty — checked and turned into what's stored. Empty means "not known",
 * stored as `null`.
 */
export interface CreatorDetailsInput {
  displayName?: string | null;
  country?: string | null;
  followerCount?: string | number | null;
}

export interface CreatorDetails {
  displayName: string | null;
  country: string | null;
  followerCount: number | null;
}

export type CreatorDetailsError = "DISPLAY_NAME_TOO_LONG" | "COUNTRY_INVALID" | "FOLLOWERS_INVALID";

export const MAX_DISPLAY_NAME_LENGTH = 80;
// Postgres `integer`.
const MAX_FOLLOWERS = 2_147_483_647;

export function parseCreatorDetails(
  input: CreatorDetailsInput,
): { ok: true; details: CreatorDetails } | { ok: false; error: CreatorDetailsError } {
  const displayName = input.displayName?.trim() || null;
  if (displayName && displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return { ok: false, error: "DISPLAY_NAME_TOO_LONG" };
  }

  let country: string | null = null;
  if (input.country?.trim()) {
    country = normalizeCountryCode(input.country);
    if (!country) return { ok: false, error: "COUNTRY_INVALID" };
  }

  const followerCount = parseFollowerCount(input.followerCount);
  if (followerCount === "invalid") return { ok: false, error: "FOLLOWERS_INVALID" };

  return { ok: true, details: { displayName, country, followerCount } };
}

/**
 * "182000", "182,000", "182.000", "182 000" and "182K" are all 182,000;
 * "1.2M" is 1,200,000 — the ways follower counts are actually written down.
 */
function parseFollowerCount(input: string | number | null | undefined): number | null | "invalid" {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return Number.isInteger(input) && input >= 0 && input <= MAX_FOLLOWERS ? input : "invalid";
  }

  const value = input.trim().toLowerCase();
  if (!value) return null;

  const suffix = /^(\d+(?:[.,]\d+)?)\s*([km])$/.exec(value);
  if (suffix) {
    const count = Math.round(Number(suffix[1].replace(",", ".")) * (suffix[2] === "k" ? 1_000 : 1_000_000));
    return count <= MAX_FOLLOWERS ? count : "invalid";
  }

  // Thousands separators only: digits in groups of three after the first.
  if (!/^\d{1,3}(?:[ ,.']\d{3})*$|^\d+$/.test(value)) return "invalid";
  const count = Number(value.replace(/[ ,.']/g, ""));
  return count <= MAX_FOLLOWERS ? count : "invalid";
}
