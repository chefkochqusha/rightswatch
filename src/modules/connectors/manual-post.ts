import type { NormalizedCommercialContent } from "./types";

/**
 * A commercial post entered by hand (Brief §1's manual path, beside the
 * connectors): for posts the TikTok API doesn't deliver — before API access
 * exists, or a post someone came across. It becomes the same
 * `NormalizedCommercialContent` a connector produces, keyed by TikTok's own
 * video id, so a later scan of the same post updates this row instead of
 * adding a second one.
 */

export interface ManualPostInput {
  url: string;
  publishedOn: string; // YYYY-MM-DD
  brands: string;
  label: string;
  territory: string;
}

export type ManualPostField = "url" | "publishedOn" | "brands" | "territory";

export type ParsedManualPost =
  | { ok: true; post: { url: string; videoId: string; handle: string; publishedAt: Date; brandNames: string[]; label: string | null; territory: string | null } }
  | { ok: false; fieldErrors: Partial<Record<ManualPostField, string>> };

const TIKTOK_POST = /^\/@([A-Za-z0-9._]{2,24})\/(?:video|photo)\/(\d{6,25})\/?$/;
const EARLIEST = Date.UTC(2016, 0, 1);

export function parseManualPost(input: ManualPostInput, now: Date = new Date()): ParsedManualPost {
  const fieldErrors: Partial<Record<ManualPostField, string>> = {};

  let videoId = "";
  let handle = "";
  let url = "";
  try {
    const parsed = new URL(input.url.trim());
    const match = TIKTOK_POST.exec(parsed.pathname);
    if (parsed.protocol !== "https:" || !/(^|\.)tiktok\.com$/.test(parsed.hostname) || !match) throw new Error();
    handle = match[1].toLowerCase();
    videoId = match[2];
    url = `https://www.tiktok.com/@${match[1]}/${parsed.pathname.includes("/photo/") ? "photo" : "video"}/${videoId}`;
  } catch {
    fieldErrors.url = "Paste the post's full TikTok link, like https://www.tiktok.com/@name/video/7301234567890123456.";
  }

  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.publishedOn.trim());
  const publishedAt = day ? new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12)) : null;
  if (!publishedAt || Number.isNaN(publishedAt.getTime()) || publishedAt.toISOString().slice(0, 10) !== input.publishedOn.trim()) {
    fieldErrors.publishedOn = "Enter the day the post was published.";
  } else if (publishedAt.getTime() < EARLIEST || publishedAt.getTime() > now.getTime() + 24 * 3600_000) {
    fieldErrors.publishedOn = "That date isn't possible for a post.";
  }

  const brandNames = input.brands
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
  if (brandNames.length > 10 || brandNames.some((b) => b.length > 80)) fieldErrors.brands = "Up to 10 brands, each up to 80 characters.";

  const territory = input.territory.trim().toUpperCase();
  if (territory && !/^[A-Z]{2}$/.test(territory)) fieldErrors.territory = "Use the two-letter country code, like DE or US, or leave it empty.";

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    post: {
      url,
      videoId,
      handle,
      publishedAt: publishedAt!,
      brandNames: [...new Set(brandNames)],
      label: input.label.trim().slice(0, 60) || "Paid partnership",
      territory: territory || null,
    },
  };
}

export function manualPostContent(
  post: Extract<ParsedManualPost, { ok: true }>["post"],
  creator: { externalId: string; handle: string },
): NormalizedCommercialContent {
  return {
    platform: "TIKTOK",
    externalContentId: post.videoId,
    creatorExternalId: creator.externalId,
    creatorUsername: creator.handle,
    publishedAt: post.publishedAt,
    brandNames: post.brandNames,
    label: post.label,
    videoUrls: [post.url],
    territory: post.territory,
    rawPayload: { source: "manual-entry" },
  };
}
