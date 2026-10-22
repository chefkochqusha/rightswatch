import { createHmac } from "node:crypto";
import { httpsUrl } from "../safe-url";
import type { ConnectorFetchParams, ConnectorFetchResult, NormalizedCommercialContent, PlatformConnector } from "../types";
import { captionDisclosure } from "./disclosure";
import { shortcodeOf } from "./links";

export { shortcodeOf };

/**
 * Instagram through Meta's official Graph API (Instagram API with Facebook
 * Login, Business Discovery): the one place that knows its request and
 * response shapes. Written against Meta's documentation, checked 2026-10-22 —
 *
 *  - `GET https://graph.facebook.com/{version}/{ig-user-id}?fields=
 *    business_discovery.username({name}){media.limit(n).after(cursor){…}}`
 *    with a Facebook user (or system user) token holding `instagram_basic`,
 *    `instagram_manage_insights` and `pages_read_engagement` (plus `ads_read`
 *    or `ads_management` when the Page role comes from Business Manager).
 *    `{ig-user-id}` is Bekvor's own Instagram professional account; the
 *    creator looked up must be a professional (business or creator) account
 *    too, and not age-gated.
 *  - Media come newest first with `paging.cursors.after`; there is no date
 *    filter, so paging stops at the first post older than the window.
 *  - Platform rate limit: 200 calls per hour per user of the app. Throttling
 *    answers error code 4, 17, 32, 613 or 80002.
 *
 * What it returns: video posts (reels included) whose caption labels them as
 * advertising (`disclosure.ts`) — Instagram's own "Paid partnership" label
 * isn't readable for another account's post. No audio: `media_url` is left
 * out for exactly the videos that matter (copyrighted or licensed music,
 * Meta changelog 2026-07-30), and Bekvor doesn't download posts. A post's
 * song is found from the video or sound someone uploads, as for TikTok.
 * Territory is `null` (unknown, never worldwide).
 *
 * NOT yet run against the live service: that needs Meta's app review
 * (`RELEASE_CHECKLIST.md`). Covered by tests with a stubbed `fetch`; every
 * failure comes back as a readable `error`, never as an empty result.
 */
export const DEFAULT_GRAPH_VERSION = "v26.0";
const GRAPH_HOST = "https://graph.facebook.com";
const MEDIA_FIELDS = "id,caption,media_type,media_product_type,permalink,shortcode,timestamp,username,media_audio_type";
const PAGE_SIZE = 50;
/** A runaway cursor must not loop forever, nor use up the hourly limit: 8 pages is 400 posts per creator and scan. */
const MAX_PAGES = 8;
const USERNAME = /^[a-z0-9._]{1,30}$/;
const THROTTLED = new Set([4, 17, 32, 613, 80001, 80002]);

export interface InstagramConnectorOptions {
  /** A long-lived Facebook user token or a system user token. Never logged. */
  accessToken: string;
  /** Bekvor's own Instagram professional account id (the `{ig-user-id}`). */
  igUserId: string;
  /** The Meta app's secret: when given, every call carries `appsecret_proof`. */
  appSecret?: string | null;
  graphVersion?: string | null;
  fetchImpl?: typeof fetch;
}

interface ApiMedia {
  id?: unknown;
  caption?: unknown;
  media_type?: unknown;
  media_product_type?: unknown;
  permalink?: unknown;
  shortcode?: unknown;
  timestamp?: unknown;
  username?: unknown;
  media_audio_type?: unknown;
}

interface ApiError {
  message?: unknown;
  code?: unknown;
  error_subcode?: unknown;
}

export class InstagramBusinessDiscoveryConnector implements PlatformConnector {
  readonly platform = "INSTAGRAM" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly version: string;

  constructor(private readonly options: InstagramConnectorOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.version = /^v\d{1,3}\.\d$/.test(options.graphVersion ?? "") ? options.graphVersion! : DEFAULT_GRAPH_VERSION;
  }

  async fetchCommercialContent(params: ConnectorFetchParams): Promise<ConnectorFetchResult> {
    const username = params.creatorUsername.toLowerCase();
    if (!USERNAME.test(username)) return { items: [], error: `"${params.creatorUsername}" isn't an Instagram username.` };
    if (!/^\d{1,30}$/.test(this.options.igUserId)) return { items: [], error: "META_IG_USER_ID must be the numeric id of Bekvor's Instagram account." };

    try {
      const items: NormalizedCommercialContent[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const { media, after } = await this.queryPage(username, cursor);
        let reachedOlder = false;
        for (const raw of media) {
          const at = typeof raw.timestamp === "string" ? new Date(raw.timestamp) : null;
          if (at && !Number.isNaN(at.getTime()) && at < params.since) {
            reachedOlder = true;
            continue;
          }
          const item = normalize(raw, params);
          if (item && item.publishedAt <= params.until) items.push(item);
        }
        if (reachedOlder || !after) return { items, error: null };
        cursor = after;
      }
      // More than 400 posts in one window (a month at most between scans) is
      // beyond what a creator publishes; the newest ones are kept rather than
      // failing the creator, which would fail the same way on every scan.
      return { items, error: null };
    } catch (error) {
      return { items: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async queryPage(username: string, cursor: string | null): Promise<{ media: ApiMedia[]; after: string | null }> {
    // The cursor is opaque base64 from Meta; only ever sent back as it came, and only if it looks like one.
    const after = cursor && /^[A-Za-z0-9_=-]{1,512}$/.test(cursor) ? `.after(${cursor})` : "";
    const fields = `business_discovery.username(${username}){username,media${after}.limit(${PAGE_SIZE}){${MEDIA_FIELDS}}}`;
    const query = new URLSearchParams({ fields });
    if (this.options.appSecret) {
      query.set("appsecret_proof", createHmac("sha256", this.options.appSecret).update(this.options.accessToken).digest("hex"));
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${GRAPH_HOST}/${this.version}/${this.options.igUserId}?${query.toString()}`, {
        headers: { Authorization: `Bearer ${this.options.accessToken}` },
      });
    } catch {
      throw new Error("Couldn't reach Instagram. The next scan tries again.");
    }
    const json = (await safeJson(response)) as {
      business_discovery?: { media?: { data?: unknown; paging?: { cursors?: { after?: unknown } } } };
      error?: ApiError;
    } | null;

    if (!response.ok || json?.error) throw new Error(describeError(json?.error, response.status, username));
    const media = json?.business_discovery?.media;
    const next = media?.paging?.cursors?.after;
    return {
      media: Array.isArray(media?.data) ? (media.data as ApiMedia[]) : [],
      after: typeof next === "string" && next ? next : null,
    };
  }
}

function normalize(raw: ApiMedia, params: ConnectorFetchParams): NormalizedCommercialContent | null {
  // Music is only in videos; reels are videos published to REELS.
  if (raw.media_type !== "VIDEO") return null;
  const publishedAt = typeof raw.timestamp === "string" ? new Date(raw.timestamp) : null;
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) return null;
  const disclosure = captionDisclosure(raw.caption);
  if (!disclosure) return null;

  const permalink = httpsUrl(raw.permalink);
  const shortcode = typeof raw.shortcode === "string" && /^[A-Za-z0-9_-]{5,64}$/.test(raw.shortcode) ? raw.shortcode : shortcodeOf(permalink);
  // The shortcode is the key a post added by hand uses too, so a scan finds that row again.
  if (!shortcode) return null;

  return {
    platform: "INSTAGRAM",
    externalContentId: shortcode,
    creatorExternalId: params.creatorExternalId,
    creatorUsername: typeof raw.username === "string" ? raw.username : params.creatorUsername,
    publishedAt,
    brandNames: [],
    label: disclosure.label,
    videoUrls: permalink && /^https:\/\/(?:www\.)?instagram\.com\//.test(permalink) ? [permalink] : [],
    territory: null,
    rawPayload: raw,
  };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function describeError(error: ApiError | undefined, status: number, username: string): string {
  const code = typeof error?.code === "number" ? error.code : null;
  const message = typeof error?.message === "string" ? error.message.slice(0, 200) : "no details";
  if (code === 190) return "Instagram refused Bekvor's access token (expired or withdrawn). Renew META_ACCESS_TOKEN.";
  if ((code !== null && THROTTLED.has(code)) || status === 429) return "Instagram is limiting requests. The next scan tries again.";
  if (code === 10 || code === 200) return `Bekvor's Meta app lacks a permission Instagram asks for (${message}).`;
  if (code === 110 || (code === 100 && /business|username|user/i.test(message))) {
    return `Instagram doesn't share @${username}'s posts: it isn't a business or creator account, doesn't exist, or is age-restricted. Add its paid posts by hand.`;
  }
  return `Instagram's API answered ${status}${code !== null ? `, code ${code}` : ""}: ${message}`;
}
