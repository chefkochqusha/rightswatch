/**
 * Turns what a member types into a TikTok username: "@lena.creates",
 * "Lena.Creates" and "https://www.tiktok.com/@lena.creates?lang=de" all
 * become "lena.creates". TikTok usernames are letters, numbers,
 * underscores and periods, at most 24 characters, and can't end with a
 * period; they're case-insensitive, so they're stored lowercase.
 */
export type UsernameResult =
  | { ok: true; username: string }
  | { ok: false; error: "USERNAME_REQUIRED" | "USERNAME_INVALID" };

const USERNAME_PATTERN = /^[a-z0-9._]{2,24}$/;

export function normalizeTikTokUsername(input: string): UsernameResult {
  let value = input.trim();
  if (!value) return { ok: false, error: "USERNAME_REQUIRED" };

  // A pasted profile link: take the "@name" path segment.
  const fromUrl = /(?:^|\/\/|\.)tiktok\.com\/@([^/?#\s]+)/i.exec(value);
  if (fromUrl) value = fromUrl[1];

  value = value.replace(/^@/, "").toLowerCase();
  if (!USERNAME_PATTERN.test(value) || value.endsWith(".")) {
    return { ok: false, error: "USERNAME_INVALID" };
  }
  return { ok: true, username: value };
}

/** The public profile URL for a TikTok username. */
export function tikTokProfileUrl(username: string): string {
  return `https://www.tiktok.com/@${username}`;
}

/**
 * Turns what a member types into an Instagram username: "@lena.creates",
 * "Lena.Creates" and "https://www.instagram.com/lena.creates/" all become
 * "lena.creates". Instagram usernames are letters, numbers, underscores and
 * periods, at most 30 characters, with no period at either end and never
 * two in a row; stored lowercase like TikTok's.
 */
const INSTAGRAM_USERNAME_PATTERN = /^[a-z0-9._]{1,30}$/;
/** First path segments on instagram.com that are pages, not profiles. */
const INSTAGRAM_RESERVED = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about", "legal"]);

export function normalizeInstagramUsername(input: string): UsernameResult {
  let value = input.trim();
  if (!value) return { ok: false, error: "USERNAME_REQUIRED" };

  // A pasted profile link: take the first path segment.
  const fromUrl = /(?:^|\/\/|\.)instagram\.com\/([^/?#\s]+)/i.exec(value);
  if (fromUrl) {
    if (INSTAGRAM_RESERVED.has(fromUrl[1].toLowerCase())) return { ok: false, error: "USERNAME_INVALID" };
    value = fromUrl[1];
  }

  value = value.replace(/^@/, "").toLowerCase();
  if (!INSTAGRAM_USERNAME_PATTERN.test(value) || value.startsWith(".") || value.endsWith(".") || value.includes("..")) {
    return { ok: false, error: "USERNAME_INVALID" };
  }
  return { ok: true, username: value };
}

/** The public profile URL for an Instagram username. */
export function instagramProfileUrl(username: string): string {
  return `https://www.instagram.com/${username}/`;
}

/** The platforms a creator can be added for. YouTube is reserved in the
 *  schema but has no way in yet. */
export type CreatorPlatform = "TIKTOK" | "INSTAGRAM";

export function normalizeUsername(platform: CreatorPlatform, input: string): UsernameResult {
  return platform === "INSTAGRAM" ? normalizeInstagramUsername(input) : normalizeTikTokUsername(input);
}

export function profileUrlFor(platform: CreatorPlatform, username: string): string {
  return platform === "INSTAGRAM" ? instagramProfileUrl(username) : tikTokProfileUrl(username);
}
