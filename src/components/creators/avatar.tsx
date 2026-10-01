/**
 * A creator's mark: their initials on a color of their own. TikTok's
 * Commercial Content API returns no profile picture (Brief §4), and
 * fetching one from the profile page would be scraping — so the color is
 * drawn from the username, the same creator always gets the same one, and
 * the handle next to it does the identifying.
 */

const TONES = [
  ["#e3ecf9", "#1f4f8f"],
  ["#e7f3ea", "#1d6b39"],
  ["#fbeee0", "#8a4b0f"],
  ["#f6e6ef", "#8a2d5c"],
  ["#ece9f8", "#4b3b9a"],
  ["#e4f2f3", "#155e66"],
  ["#f3efe4", "#6a5420"],
  ["#f9e8e6", "#9a3226"],
] as const;

function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

export function creatorInitials(handle: string, displayName: string | null): string {
  const source = displayName?.trim() || handle.replace(/^@/, "");
  const words = source.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

export function CreatorAvatar({
  handle,
  displayName = null,
  className = "h-9 w-9 text-[0.8125rem]",
}: {
  handle: string;
  displayName?: string | null;
  className?: string;
}) {
  const [background, color] = TONES[hash(handle.toLowerCase()) % TONES.length];
  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center rounded-full font-semibold tracking-[0.01em] ${className}`}
      style={{ backgroundColor: background, color }}
    >
      {creatorInitials(handle, displayName)}
    </span>
  );
}
