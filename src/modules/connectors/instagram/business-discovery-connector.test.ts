import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { InstagramBusinessDiscoveryConnector, shortcodeOf } from "./business-discovery-connector";
import { captionDisclosure } from "./disclosure";

const PARAMS = {
  creatorExternalId: "lena.creates",
  creatorUsername: "lena.creates",
  since: new Date("2026-09-01T00:00:00Z"),
  until: new Date("2026-09-30T23:59:59Z"),
};

function stubFetch(answers: Array<{ status?: number; json?: unknown } | "network" | "badjson">) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const answer = answers.shift();
    if (!answer) throw new Error("unexpected extra request");
    if (answer === "network") throw new TypeError("fetch failed");
    if (answer === "badjson") return new Response("<html>", { status: 502 });
    return new Response(JSON.stringify(answer.json ?? {}), { status: answer.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const media = (shortcode: string, timestamp: string, extra: Record<string, unknown> = {}) => ({
  id: `1789${shortcode.length}`,
  caption: "Neuer Drop 🔥 #werbung @voltcoffee",
  media_type: "VIDEO",
  media_product_type: "REELS",
  permalink: `https://www.instagram.com/reel/${shortcode}/`,
  shortcode,
  timestamp,
  username: "lena.creates",
  media_audio_type: "MUSIC",
  ...extra,
});
const page = (data: unknown[], after?: string) => ({
  json: { business_discovery: { username: "lena.creates", media: { data, ...(after ? { paging: { cursors: { after } } } : {}) } }, id: "17841400000000000" },
});

function connector(answers: Parameters<typeof stubFetch>[0], options: { appSecret?: string; graphVersion?: string } = {}) {
  const stub = stubFetch(answers);
  return {
    stub,
    connector: new InstagramBusinessDiscoveryConnector({ accessToken: "tok-secret", igUserId: "17841400000000000", fetchImpl: stub.impl, ...options }),
  };
}

describe("InstagramBusinessDiscoveryConnector", () => {
  test("asks Business Discovery for the creator's media, with the token in a header, not the URL", async () => {
    const { stub, connector: c } = connector([page([media("DAbcdef12", "2026-09-10T12:00:00+0000")])]);
    const result = await c.fetchCommercialContent(PARAMS);
    assert.equal(result.error, null);
    assert.equal(stub.calls.length, 1);
    const url = new URL(stub.calls[0].url);
    assert.equal(url.origin + url.pathname, "https://graph.facebook.com/v26.0/17841400000000000");
    assert.match(url.searchParams.get("fields")!, /^business_discovery\.username\(lena\.creates\)\{username,media\.limit\(50\)\{id,caption,/);
    assert.ok(!stub.calls[0].url.includes("tok-secret"));
    assert.equal((stub.calls[0].init.headers as Record<string, string>).Authorization, "Bearer tok-secret");
    assert.equal(url.searchParams.has("appsecret_proof"), false);
  });

  test("normalizes a labelled reel: shortcode as id, permalink, caption label, no audio, no territory", async () => {
    const { connector: c } = connector([page([media("DAbcdef12", "2026-09-10T12:00:00+0000")])]);
    const { items } = await c.fetchCommercialContent(PARAMS);
    assert.equal(items.length, 1);
    const [item] = items;
    assert.equal(item.platform, "INSTAGRAM");
    assert.equal(item.externalContentId, "DAbcdef12");
    assert.equal(item.creatorExternalId, "lena.creates");
    assert.deepEqual(item.videoUrls, ["https://www.instagram.com/reel/DAbcdef12/"]);
    assert.equal(item.publishedAt.toISOString(), "2026-09-10T12:00:00.000Z");
    assert.equal(item.label, 'Labelled as an ad in the caption ("#werbung")');
    assert.deepEqual(item.brandNames, []);
    assert.equal(item.territory, null);
  });

  test("keeps only videos whose caption labels them as ads", async () => {
    const { connector: c } = connector([
      page([
        media("Aaaaaaa1", "2026-09-20T10:00:00+0000"),
        media("Aaaaaaa2", "2026-09-19T10:00:00+0000", { caption: "Sonntag am See" }),
        media("Aaaaaaa3", "2026-09-18T10:00:00+0000", { media_type: "IMAGE" }),
        media("Aaaaaaa4", "2026-09-17T10:00:00+0000", { media_type: "CAROUSEL_ALBUM" }),
        media("Aaaaaaa5", "2026-09-16T10:00:00+0000", { caption: undefined }),
        media("Aaaaaaa6", "2026-09-15T10:00:00+0000", { caption: "Anzeige | danke @brand" }),
      ]),
    ]);
    const { items } = await c.fetchCommercialContent(PARAMS);
    assert.deepEqual(items.map((i) => i.externalContentId), ["Aaaaaaa1", "Aaaaaaa6"]);
  });

  test("pages with the after cursor and stops at the first post older than the window", async () => {
    const { stub, connector: c } = connector([
      page([media("Bbbbbbb1", "2026-10-05T10:00:00+0000"), media("Bbbbbbb2", "2026-09-25T10:00:00+0000")], "QVFIUmxyZA"),
      page([media("Bbbbbbb3", "2026-09-02T10:00:00+0000"), media("Bbbbbbb4", "2026-08-30T10:00:00+0000")], "QVFIUmxyZB"),
    ]);
    const result = await c.fetchCommercialContent(PARAMS);
    assert.equal(result.error, null);
    assert.equal(stub.calls.length, 2, "no third page once older posts appear");
    assert.match(new URL(stub.calls[1].url).searchParams.get("fields")!, /media\.after\(QVFIUmxyZA\)\.limit\(50\)/);
    // 10-05 is after the window, 08-30 before it.
    assert.deepEqual(result.items.map((i) => i.externalContentId), ["Bbbbbbb2", "Bbbbbbb3"]);
  });

  test("never sends back a cursor that doesn't look like one", async () => {
    const { stub, connector: c } = connector([page([media("Ccccccc1", "2026-09-25T10:00:00+0000")], "x){evil}"), page([])]);
    await c.fetchCommercialContent(PARAMS);
    assert.doesNotMatch(new URL(stub.calls[1].url).searchParams.get("fields")!, /evil/);
  });

  test("stops after 8 pages and keeps what it has", async () => {
    const answers = Array.from({ length: 8 }, (_, n) => page([media(`Ddddddd${n}`, "2026-09-25T10:00:00+0000")], `CURSOR${n}`));
    const { stub, connector: c } = connector(answers);
    const result = await c.fetchCommercialContent(PARAMS);
    assert.equal(stub.calls.length, 8);
    assert.equal(result.error, null);
    assert.equal(result.items.length, 8);
  });

  test("signs calls with appsecret_proof when the app secret is set, and uses a configured version", async () => {
    const { stub, connector: c } = connector([page([])], { appSecret: "app-secret", graphVersion: "v25.0" });
    await c.fetchCommercialContent(PARAMS);
    const url = new URL(stub.calls[0].url);
    assert.equal(url.pathname, "/v25.0/17841400000000000");
    assert.equal(url.searchParams.get("appsecret_proof"), createHmac("sha256", "app-secret").update("tok-secret").digest("hex"));
  });

  test("ignores a malformed version and falls back to the default", async () => {
    const { stub, connector: c } = connector([page([])], { graphVersion: "../v1" });
    await c.fetchCommercialContent(PARAMS);
    assert.equal(new URL(stub.calls[0].url).pathname, "/v26.0/17841400000000000");
  });

  test("refuses a username that isn't one before calling anything", async () => {
    const { stub, connector: c } = connector([]);
    const result = await c.fetchCommercialContent({ ...PARAMS, creatorUsername: "lena){media" });
    assert.match(result.error!, /isn't an Instagram username/);
    assert.equal(stub.calls.length, 0);
  });

  test("turns Meta's errors into readable ones, without the token", async () => {
    const cases: Array<[unknown, number, RegExp]> = [
      [{ error: { message: "Error validating access token", code: 190 } }, 400, /Renew META_ACCESS_TOKEN/],
      [{ error: { message: "Application request limit reached", code: 4 } }, 400, /limiting requests/],
      [{ error: { message: "rate", code: 80002 } }, 400, /limiting requests/],
      [{ error: { message: "Invalid user id", code: 110 } }, 400, /isn't a business or creator account/],
      [{ error: { message: "(#10) Requires instagram_manage_insights", code: 10 } }, 403, /lacks a permission/],
      [{ error: { message: "Something else", code: 1 } }, 500, /answered 500, code 1: Something else/],
    ];
    for (const [json, status, expected] of cases) {
      const { connector: c } = connector([{ status, json }]);
      const result = await c.fetchCommercialContent(PARAMS);
      assert.deepEqual(result.items, []);
      assert.match(result.error!, expected);
      assert.doesNotMatch(result.error!, /tok-secret/);
    }
  });

  test("a network failure or an HTML answer is an error, not zero posts", async () => {
    for (const answer of ["network", "badjson"] as const) {
      const { connector: c } = connector([answer]);
      const result = await c.fetchCommercialContent(PARAMS);
      assert.ok(result.error, answer);
    }
  });

  test("falls back to the permalink's shortcode, and skips a post with neither", async () => {
    const { connector: c } = connector([
      page([
        media("Eeeeeee1", "2026-09-25T10:00:00+0000", { shortcode: undefined, permalink: "https://www.instagram.com/p/Eeeeeee1/" }),
        media("Eeeeeee2", "2026-09-24T10:00:00+0000", { shortcode: undefined, permalink: "javascript:alert(1)" }),
      ]),
    ]);
    const { items } = await c.fetchCommercialContent(PARAMS);
    assert.deepEqual(items.map((i) => i.externalContentId), ["Eeeeeee1"]);
  });
});

describe("shortcodeOf", () => {
  test("reads /p/, /reel/, /reels/, /tv/ and username-prefixed links", () => {
    assert.equal(shortcodeOf("https://www.instagram.com/p/C1a2B3c4D5e/"), "C1a2B3c4D5e");
    assert.equal(shortcodeOf("https://instagram.com/reel/C1a2B3c4D5e"), "C1a2B3c4D5e");
    assert.equal(shortcodeOf("https://www.instagram.com/reels/C1a2B3c4D5e/?igsh=abc"), "C1a2B3c4D5e");
    assert.equal(shortcodeOf("https://www.instagram.com/tv/C1a2B3c4D5e/"), "C1a2B3c4D5e");
    assert.equal(shortcodeOf("https://www.instagram.com/lena.creates/p/C1a2B3c4D5e/"), "C1a2B3c4D5e");
    assert.equal(shortcodeOf("https://www.instagram.com/lena.creates/"), null);
    assert.equal(shortcodeOf("https://evil.example/p/C1a2B3c4D5e/"), null);
    assert.equal(shortcodeOf(null), null);
  });
});

describe("captionDisclosure", () => {
  test("finds the usual labels in German, English and other languages", () => {
    for (const [caption, term] of [
      ["Werbung | Mein Lieblingsdrink", "Werbung"],
      ["Neuer Song 🎶 #anzeige", "#anzeige"],
      ["[Werbung] danke an die Crew", "Werbung"],
      ["Summer vibes #ad", "#ad"],
      ["Thanks @brand! #sponsored", "#sponsored"],
      ["(ad) new drop", "(ad)"],
      ["Paid partnership with Volt", "Paid partnership"],
      ["In Kooperation mit Volt", "In Kooperation mit"],
      ["Nouveau #publicité", "#publicité"],
      ["reklame/samarbeid med Volt", "reklame"],
    ] as const) {
      assert.equal(captionDisclosure(caption)?.term, term, caption);
    }
  });

  test("doesn't fire on words that only contain a label", () => {
    for (const caption of ["#adidas drop", "Anzeigetafel am Bahnhof", "Werbungskosten absetzen", "loading…", "ad astra", "#adventure", "Bad Segeberg"]) {
      assert.equal(captionDisclosure(caption), null, caption);
    }
  });

  test("nothing for a missing or empty caption", () => {
    assert.equal(captionDisclosure(undefined), null);
    assert.equal(captionDisclosure(""), null);
  });
});
