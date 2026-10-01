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
