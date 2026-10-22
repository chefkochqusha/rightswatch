import type { Platform } from "../connectors/types";

/**
 * Turns what a member types into a username on the creator's platform.
 *
 * - **TikTok**: "@lena.creates", "Lena.Creates" and
 *   "https://www.tiktok.com/@lena.creates?lang=de" all become
 *   "lena.creates". Letters, numbers, underscores and periods, at most 24
 *   characters, not ending with a period.
 * - **Instagram**: "@lena.creates" and "https://www.instagram.com/lena.creates/"
 *   become "lena.creates". Letters, numbers, underscores and periods, at
 *   most 30 characters, not starting or ending with a period and without two
 *   periods in a row.
 *
 * Both are case-insensitive, so they're stored lowercase.
 */
export type UsernameResult =
  | { ok: true; username: string }
  | { ok: false; error: "USERNAME_REQUIRED" | "USERNAME_INVALID" };

/** The platforms a creator can be added for: those with a way in (a
 *  connector, or posts added by hand). */
export type WatchablePlatform = Extract<Platform, "TIKTOK" | "INSTAGRAM">;
export const WATCHABLE_PLATFORMS: readonly WatchablePlatform[] = ["TIKTOK", "INSTAGRAM"];

export function isWatchablePlatform(value: string): value is WatchablePlatform {
  return (WATCHABLE_PLATFORMS as readonly string[]).includes(value);
}

const TIKTOK_PATTERN = /^[a-z0-9._]{2,24}$/;
const INSTAGRAM_PATTERN = /^[a-z0-9._]{1,30}$/;

/** Instagram paths that are pages, not profiles. */
const INSTAGRAM_RESERVED = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about", "legal"]);

export function normalizeTikTokUsername(input: string): UsernameResult {
  let value = input.trim();
  if (!value) return { ok: false, error: "USERNAME_REQUIRED" };

  // A pasted profile link: take the "@name" path segment.
  const fromUrl = /(?:^|\/\/|\.)tiktok\.com\/@([^/?#\s]+)/i.exec(value);
  if (fromUrl) value = fromUrl[1];

  value = value.replace(/^@/, "").toLowerCase();
  if (!TIKTOK_PATTERN.test(value) || value.endsWith(".")) {
    return { ok: false, error: "USERNAME_INVALID" };
  }
  return { ok: true, username: value };
}

export function normalizeInstagramUsername(input: string): UsernameResult {
  let value = input.trim();
  if (!value) return { ok: false, error: "USERNAME_REQUIRED" };

  // A pasted profile link: the first path segment, unless it's a page like /p/.
  const fromUrl = /(?:^|\/\/|\.)instagram\.com\/([^/?#\s]+)/i.exec(value);
  if (fromUrl) {
    if (INSTAGRAM_RESERVED.has(fromUrl[1].toLowerCase())) return { ok: false, error: "USERNAME_INVALID" };
    value = fromUrl[1];
  }

  value = value.replace(/^@/, "").toLowerCase();
  if (!INSTAGRAM_PATTERN.test(value) || value.startsWith(".") || value.endsWith(".") || value.includes("..")) {
    return { ok: false, error: "USERNAME_INVALID" };
  }
  return { ok: true, username: value };
}

/** The platform a pasted profile link belongs to, or `null` for a bare name. */
export function platformOfProfileLink(input: string): WatchablePlatform | null {
  if (/(?:^|\/\/|\.)tiktok\.com\//i.test(input)) return "TIKTOK";
  if (/(?:^|\/\/|\.)instagram\.com\//i.test(input)) return "INSTAGRAM";
  return null;
}

export function normalizeUsername(platform: WatchablePlatform, input: string): UsernameResult {
  return platform === "INSTAGRAM" ? normalizeInstagramUsername(input) : normalizeTikTokUsername(input);
}

/** The public profile URL for a TikTok username. */
export function tikTokProfileUrl(username: string): string {
  return `https://www.tiktok.com/@${username}`;
}

/** The public profile URL for an Instagram username. */
export function instagramProfileUrl(username: string): string {
  return `https://www.instagram.com/${username}/`;
}

export function profileUrlFor(platform: WatchablePlatform, username: string): string {
  return platform === "INSTAGRAM" ? instagramProfileUrl(username) : tikTokProfileUrl(username);
}
