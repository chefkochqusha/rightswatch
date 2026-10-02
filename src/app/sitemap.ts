import type { MetadataRoute } from "next";
import { siteOrigin } from "./_lib/site-origin";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  return [
    { url: origin, changeFrequency: "monthly", priority: 1 },
    { url: `${origin}/imprint`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${origin}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
