import type { ConnectorFetchParams, ConnectorFetchResult, NormalizedCommercialContent, PlatformConnector } from "../types";

/**
 * The real TikTok Commercial Content API (Brief §4, §9): the one place that
 * knows its request and response shapes. Written against TikTok's public
 * documentation —
 *
 *  - token: `POST https://open.tiktokapis.com/v2/oauth/token/`, form-encoded
 *    `client_key`, `client_secret` and `grant_type=client_credentials`;
 *    answers `access_token` and `expires_in` (two hours).
 *  - query: `POST https://open.tiktokapis.com/v2/research/adlib/commercial_content/query/`
 *    with `?fields=…`, a bearer token, and a body of
 *    `{ filters: { content_published_date_range: { min, max } (YYYYMMDD),
 *    creator_usernames }, max_count (≤ 50), search_id }`. It answers
 *    `data.commercial_contents`, `data.has_more` and `data.search_id` (the
 *    cursor to send back for the next page).
 *
 * NOT yet run against the live service: that needs an approved TikTok
 * research application (`RELEASE_CHECKLIST.md`). Everything here is covered
 * by tests with a stubbed `fetch`, and the first live call may well show a
 * detail the documentation leaves out — which is why every failure comes
 * back as a readable `error` rather than an empty result.
 *
 * It returns what the API gives and nothing it doesn't: no music (the API
 * has none, Brief §4) and no territory (`null`, which the rights engine
 * reads as unknown, never as worldwide).
 */
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const QUERY_URL = "https://open.tiktokapis.com/v2/research/adlib/commercial_content/query/";
const FIELDS = "id,create_timestamp,create_date,label,brand_names,creator,videos";
/** The API's own floor for the publication date range. */
const EARLIEST = Date.UTC(2022, 9, 1);
const PAGE_SIZE = 50;
/** A runaway cursor must not loop forever: 50 pages is 2,500 posts for one creator. */
const MAX_PAGES = 50;
/** Renew a little before the token's stated end. */
const TOKEN_SAFETY_MS = 60_000;

export interface TikTokConnectorOptions {
  clientKey: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

interface ApiVideo {
  id?: unknown;
  url?: unknown;
}

interface ApiCommercialContent {
  id?: unknown;
  create_timestamp?: unknown;
  label?: unknown;
  brand_names?: unknown;
  creator?: unknown;
  videos?: unknown;
}

export class TikTokCommercialContentConnector implements PlatformConnector {
  readonly platform = "TIKTOK" as const;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly options: TikTokConnectorOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async fetchCommercialContent(params: ConnectorFetchParams): Promise<ConnectorFetchResult> {
    try {
      const items: NormalizedCommercialContent[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < MAX_PAGES; page++) {
        const body = await this.queryPage(params, cursor);
        for (const raw of body.contents) {
          const item = normalize(raw, params);
          if (item) items.push(item);
        }
        if (!body.hasMore || !body.searchId) return { items, error: null };
        cursor = body.searchId;
      }
      return { items, error: `TikTok kept returning more pages after ${MAX_PAGES}. The first ${items.length} posts were kept.` };
    } catch (error) {
      return { items: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.now().getTime() < this.token.expiresAt) return this.token.value;

    const response = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: this.options.clientKey,
        client_secret: this.options.clientSecret,
        grant_type: "client_credentials",
      }).toString(),
    });
    const json = (await safeJson(response)) as { access_token?: unknown; expires_in?: unknown; error?: unknown; error_description?: unknown } | null;
    if (!response.ok || typeof json?.access_token !== "string") {
      throw new Error(`TikTok refused the credentials (${response.status}): ${describeError(json)}`);
    }
    const lifetimeMs = (typeof json.expires_in === "number" ? json.expires_in : 7200) * 1000;
    this.token = { value: json.access_token, expiresAt: this.now().getTime() + lifetimeMs - TOKEN_SAFETY_MS };
    return this.token.value;
  }

  private async queryPage(params: ConnectorFetchParams, cursor: string | undefined) {
    const request = async () =>
      this.fetchImpl(`${QUERY_URL}?fields=${encodeURIComponent(FIELDS)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          filters: {
            content_published_date_range: { min: ymd(params.since), max: ymd(params.until) },
            creator_usernames: [params.creatorUsername],
          },
          max_count: PAGE_SIZE,
          ...(cursor ? { search_id: cursor } : {}),
        }),
      });

    let response = await request();
    if (response.status === 401) {
      // The token can end early; get a fresh one once.
      this.token = null;
      response = await request();
    }
    const json = (await safeJson(response)) as {
      data?: { commercial_contents?: unknown; has_more?: unknown; search_id?: unknown };
      error?: unknown;
    } | null;

    if (response.status === 429) throw new Error("TikTok is rate limiting requests. The next scan tries again.");
    if (!response.ok) throw new Error(`TikTok's commercial content query failed (${response.status}): ${describeError(json)}`);
    // TikTok answers 200 with `error.code` "ok" on success.
    const code = (json?.error as { code?: unknown } | undefined)?.code;
    if (typeof code === "string" && code !== "ok") throw new Error(`TikTok's commercial content query failed: ${describeError(json)}`);

    const contents = json?.data?.commercial_contents;
    return {
      contents: Array.isArray(contents) ? (contents as ApiCommercialContent[]) : [],
      hasMore: json?.data?.has_more === true,
      searchId: typeof json?.data?.search_id === "string" ? json.data.search_id : null,
    };
  }
}

function normalize(raw: ApiCommercialContent, params: ConnectorFetchParams): NormalizedCommercialContent | null {
  const id = typeof raw.id === "string" ? raw.id : typeof raw.id === "number" ? String(raw.id) : null;
  const timestamp = typeof raw.create_timestamp === "number" ? raw.create_timestamp : null;
  // Without an id there's no stable key to deduplicate on, and without a date
  // the post can't be placed against a rights term: better skipped than guessed.
  if (!id || timestamp === null) return null;

  const creator = raw.creator as { username?: unknown } | string | undefined;
  const username = typeof creator === "string" ? creator : typeof creator?.username === "string" ? creator.username : params.creatorUsername;

  return {
    platform: "TIKTOK",
    externalContentId: id,
    creatorExternalId: params.creatorExternalId,
    creatorUsername: username,
    publishedAt: new Date(timestamp * 1000),
    brandNames: Array.isArray(raw.brand_names) ? raw.brand_names.filter((b): b is string => typeof b === "string") : [],
    label: typeof raw.label === "string" ? raw.label : null,
    videoUrls: Array.isArray(raw.videos)
      ? (raw.videos as ApiVideo[]).flatMap((video) => (typeof video?.url === "string" ? [video.url] : []))
      : [],
    territory: null,
    rawPayload: raw,
  };
}

function ymd(date: Date): string {
  const clamped = new Date(Math.max(date.getTime(), EARLIEST));
  return clamped.toISOString().slice(0, 10).replaceAll("-", "");
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function describeError(json: unknown): string {
  const body = json as { error?: unknown; error_description?: unknown; message?: unknown } | null;
  const error = body?.error;
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; message?: unknown };
    return [e.code, e.message].filter((v) => typeof v === "string" && v).join(": ") || "no details";
  }
  return [error, body?.error_description, body?.message].filter((v) => typeof v === "string" && v).join(": ") || "no details";
}
