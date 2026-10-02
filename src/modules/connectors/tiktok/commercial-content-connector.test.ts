import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { TikTokCommercialContentConnector } from "./commercial-content-connector";

const PARAMS = {
  creatorExternalId: "creator-1",
  creatorUsername: "lena.creates",
  since: new Date("2026-09-01T00:00:00Z"),
  until: new Date("2026-09-30T23:59:59Z"),
};

interface Call {
  url: string;
  init: RequestInit;
}

/** A fetch that answers from a queue, in order, and records what it was asked. */
function stubFetch(answers: Array<{ status?: number; json?: unknown } | "badjson">) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const answer = answers.shift();
    if (!answer) throw new Error("unexpected extra request");
    if (answer === "badjson") return new Response("<html>", { status: 502 });
    return new Response(JSON.stringify(answer.json ?? {}), { status: answer.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const token = { json: { access_token: "tok-1", expires_in: 7200, token_type: "Bearer" } };
const post = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  create_timestamp: 1_788_000_000,
  create_date: "20260829",
  label: "Paid partnership",
  brand_names: ["Volt Coffee"],
  creator: { username: "lena.creates" },
  videos: [{ id: "v1", url: "https://www.tiktok.com/@lena.creates/video/1", cover_image_url: "x", status: "ok" }],
  ...extra,
});
const page = (contents: unknown[], more?: string) => ({ json: { data: { commercial_contents: contents, has_more: Boolean(more), search_id: more }, error: { code: "ok", message: "" } } });

function connector(answers: Parameters<typeof stubFetch>[0], now = () => new Date("2026-10-02T00:00:00Z")) {
  const stub = stubFetch(answers);
  return { stub, connector: new TikTokCommercialContentConnector({ clientKey: "ck", clientSecret: "cs", fetchImpl: stub.impl, now }) };
}

describe("TikTokCommercialContentConnector", () => {
  test("gets a client-credentials token, then queries with the creator and the date range", async () => {
    const { stub, connector: c } = connector([token, page([post("1")])]);
    const result = await c.fetchCommercialContent(PARAMS);

    assert.equal(result.error, null);
    const [tokenCall, queryCall] = stub.calls;
    assert.equal(tokenCall.url, "https://open.tiktokapis.com/v2/oauth/token/");
    const form = new URLSearchParams(String(tokenCall.init.body));
    assert.equal(form.get("grant_type"), "client_credentials");
    assert.equal(form.get("client_key"), "ck");
    assert.equal(form.get("client_secret"), "cs");

    assert.ok(queryCall.url.startsWith("https://open.tiktokapis.com/v2/research/adlib/commercial_content/query/?fields="));
    assert.equal((queryCall.init.headers as Record<string, string>).Authorization, "Bearer tok-1");
    const body = JSON.parse(String(queryCall.init.body));
    assert.deepEqual(body.filters, {
      content_published_date_range: { min: "20260901", max: "20260930" },
      creator_usernames: ["lena.creates"],
    });
    assert.equal(body.max_count, 50);
    assert.equal("search_id" in body, false);
  });

  test("normalizes a post: ids, time, brands, label, video urls, no territory", async () => {
    const { connector: c } = connector([token, page([post("7345", { brand_names: ["Volt Coffee", "Feld & Co."] })])]);
    const { items } = await c.fetchCommercialContent(PARAMS);
    assert.equal(items.length, 1);
    const [item] = items;
    assert.equal(item.platform, "TIKTOK");
    assert.equal(item.externalContentId, "7345");
    assert.equal(item.creatorExternalId, "creator-1");
    assert.equal(item.creatorUsername, "lena.creates");
    assert.equal(item.publishedAt.getTime(), 1_788_000_000_000);
    assert.deepEqual(item.brandNames, ["Volt Coffee", "Feld & Co."]);
    assert.equal(item.label, "Paid partnership");
    assert.deepEqual(item.videoUrls, ["https://www.tiktok.com/@lena.creates/video/1"]);
    assert.equal(item.territory, null);
  });

  test("follows the cursor until there are no more pages", async () => {
    const { stub, connector: c } = connector([token, page([post("1")], "cursor-a"), page([post("2")], "cursor-b"), page([post("3")])]);
    const { items, error } = await c.fetchCommercialContent(PARAMS);
    assert.equal(error, null);
    assert.deepEqual(items.map((i) => i.externalContentId), ["1", "2", "3"]);
    assert.equal(JSON.parse(String(stub.calls[2].init.body)).search_id, "cursor-a");
    assert.equal(JSON.parse(String(stub.calls[3].init.body)).search_id, "cursor-b");
  });

  test("reuses the token across calls, and asks again once it has expired", async () => {
    let clock = new Date("2026-10-02T00:00:00Z").getTime();
    const { stub, connector: c } = connector([token, page([]), page([]), token, page([])], () => new Date(clock));
    await c.fetchCommercialContent(PARAMS);
    await c.fetchCommercialContent(PARAMS);
    assert.equal(stub.calls.filter((call) => call.url.includes("/oauth/token/")).length, 1);
    clock += 3 * 3_600_000;
    await c.fetchCommercialContent(PARAMS);
    assert.equal(stub.calls.filter((call) => call.url.includes("/oauth/token/")).length, 2);
  });

  test("a 401 on the query renews the token once and retries", async () => {
    const { stub, connector: c } = connector([token, { status: 401, json: { error: { code: "access_token_invalid" } } }, { json: { access_token: "tok-2", expires_in: 7200 } }, page([post("1")])]);
    const { items, error } = await c.fetchCommercialContent(PARAMS);
    assert.equal(error, null);
    assert.equal(items.length, 1);
    assert.equal((stub.calls[3].init.headers as Record<string, string>).Authorization, "Bearer tok-2");
  });

  test("refused credentials come back as an error, not as zero posts", async () => {
    const { connector: c } = connector([{ status: 401, json: { error: "invalid_client", error_description: "Client key or secret is incorrect." } }]);
    const result = await c.fetchCommercialContent(PARAMS);
    assert.deepEqual(result.items, []);
    assert.match(result.error ?? "", /refused the credentials \(401\).*invalid_client/);
  });

  test("rate limiting, server errors and unreadable answers all say so", async () => {
    const limited = await connector([token, { status: 429, json: {} }]).connector.fetchCommercialContent(PARAMS);
    assert.match(limited.error ?? "", /rate limiting/);

    const broken = await connector([token, "badjson"]).connector.fetchCommercialContent(PARAMS);
    assert.match(broken.error ?? "", /failed \(502\)/);

    const apiError = await connector([token, { json: { error: { code: "invalid_params", message: "Bad date range" } } }]).connector.fetchCommercialContent(PARAMS);
    assert.match(apiError.error ?? "", /invalid_params: Bad date range/);
  });

  test("a network failure is an error too", async () => {
    const failing = new TikTokCommercialContentConnector({ clientKey: "a", clientSecret: "b", fetchImpl: (async () => { throw new Error("socket hang up"); }) as typeof fetch });
    assert.deepEqual(await failing.fetchCommercialContent(PARAMS), { items: [], error: "socket hang up" });
  });

  test("skips a post with no id or no date instead of guessing", async () => {
    const { connector: c } = connector([token, page([post("1"), { label: "x" }, post("3", { create_timestamp: undefined })])]);
    const { items } = await c.fetchCommercialContent(PARAMS);
    assert.deepEqual(items.map((i) => i.externalContentId), ["1"]);
  });

  test("a date range before TikTok's earliest day is moved up to it", async () => {
    const { stub, connector: c } = connector([token, page([])]);
    await c.fetchCommercialContent({ ...PARAMS, since: new Date("2020-01-01T00:00:00Z") });
    assert.equal(JSON.parse(String(stub.calls[1].init.body)).filters.content_published_date_range.min, "20221001");
  });

  test("never puts the client secret into an error message", async () => {
    const { connector: c } = connector([{ status: 400, json: { error: "invalid_request", error_description: "bad" } }]);
    const result = await c.fetchCommercialContent(PARAMS);
    assert.ok(!(result.error ?? "").includes("cs"));
  });
});
