import type { MetadataRoute } from "next";
import { siteOrigin } from "./_lib/site-origin";

/**
 * Only the public site is for search engines. The app, its sign-in pages and
 * the endpoints are not: the public demo lives under /workspace too.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/workspace", "/api/", "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/invite", "/demo"],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
