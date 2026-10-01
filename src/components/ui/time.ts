const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
const dateOnly = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/**
 * "just now", "5 minutes ago", "yesterday", "3 weeks ago" — how recent
 * activity reads (Brief §7: "Last sync: 2 minutes ago"). Past a year, the
 * date itself says more.
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < 60_000 && elapsed > -60_000) return "just now";
  if (elapsed >= 365 * 86_400_000) return dateOnly.format(date);
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) return relative.format(-Math.round(elapsed / ms), unit);
  }
  return "just now";
}
