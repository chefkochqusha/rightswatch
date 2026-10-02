/**
 * The public origin of the site, for metadata that needs absolute URLs
 * (sitemap, robots, link previews). Configuration only: `APP_URL`, then
 * Vercel's production domain, then localhost for development.
 */
export function siteOrigin(): string {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
