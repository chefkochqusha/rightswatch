/** The shortcode in an instagram.com post link: /p/{code}/, /reel/{code}/, /tv/{code}/. */
export function shortcodeOf(url: string | null): string | null {
  if (!url) return null;
  const match = /^https:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9._]{1,30}\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,64})\/?/.exec(url);
  return match ? match[1] : null;
}
