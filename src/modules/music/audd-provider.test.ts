import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { AuddRecognitionProvider, AUDD_MATCH_CONFIDENCE } from "./audd-provider";

function stub(answers: Array<unknown | Error | { status: number }>) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body as URLSearchParams });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    if (next && typeof next === "object" && "status" in next && typeof (next as { status: unknown }).status === "number") {
      return new Response("nope", { status: (next as { status: number }).status });
    }
    return new Response(JSON.stringify(next), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const input = { externalContentId: "post-1", videoUrls: ["https://v.example/1.mp4", "https://v.example/2.mp4"] };

describe("AuddRecognitionProvider", () => {
  test("a match carries title, artist, the ISRC from Spotify's block, the provider and the fixed confidence", async () => {
    const { fetchImpl, calls } = stub([
      { status: "success", result: { artist: "Kova", title: "Signals", spotify: { external_ids: { isrc: "de-abc-26-00001" } } } },
    ]);
    const result = await new AuddRecognitionProvider({ apiToken: "secret-token", fetchImpl }).identify(input);
    assert.equal(result.error, null);
    assert.deepEqual(result.matches, [
      { trackId: "DEABC2600001", title: "Signals", artist: "Kova", isrc: "DEABC2600001", confidence: AUDD_MATCH_CONFIDENCE, provider: "audd", manual: false },
    ]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.get("api_token"), "secret-token");
    assert.equal(calls[0].body.get("url"), "https://v.example/1.mp4");
    assert.match(calls[0].body.get("return") ?? "", /spotify/);
  });

  test("falls back to Apple Music's or Deezer's ISRC, and to a made-up id when there is none", async () => {
    const apple = stub([{ status: "success", result: { artist: "A", title: "B", apple_music: { isrc: "USXYZ2600002" } } }]);
    assert.equal((await new AuddRecognitionProvider({ apiToken: "t", fetchImpl: apple.fetchImpl }).identify(input)).matches[0].isrc, "USXYZ2600002");
    const none = stub([{ status: "success", result: { artist: "Aiko", title: "Midnight Run" } }]);
    const match = (await new AuddRecognitionProvider({ apiToken: "t", fetchImpl: none.fetchImpl }).identify(input)).matches[0];
    assert.equal(match.isrc, null);
    assert.equal(match.trackId, "audd:aiko:midnight run");
  });

  test("an empty or null result is 'no song identified', not an error, and stops after the first URL", async () => {
    for (const answer of [{ status: "success", result: null }, { status: "success", result: [] }, { status: "success" }]) {
      const { fetchImpl, calls } = stub([answer]);
      const result = await new AuddRecognitionProvider({ apiToken: "t", fetchImpl }).identify(input);
      assert.deepEqual(result, { matches: [], error: null });
      assert.equal(calls.length, 1);
    }
  });

  test("a failing URL is skipped and the next one tried; an answer from the second counts", async () => {
    const { fetchImpl, calls } = stub([
      { status: "error", error: { error_code: 600, error_message: "Incorrect audio url" } },
      { status: "success", result: { artist: "Riva", title: "Golden Hour" } },
    ]);
    const result = await new AuddRecognitionProvider({ apiToken: "t", fetchImpl }).identify(input);
    assert.equal(result.matches[0].title, "Golden Hour");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.get("url"), "https://v.example/2.mp4");
  });

  test("when every URL fails the last error is reported, never thrown: API error, HTTP error, network error", async () => {
    const api = stub([{ status: "error", error: { error_code: 900, error_message: "Invalid token" } }]);
    assert.match((await new AuddRecognitionProvider({ apiToken: "t", fetchImpl: api.fetchImpl }).identify({ ...input, videoUrls: ["https://v.example/u.mp4"] })).error ?? "", /#900.*Invalid token/);
    const http = stub([{ status: 503 }]);
    assert.match((await new AuddRecognitionProvider({ apiToken: "t", fetchImpl: http.fetchImpl }).identify({ ...input, videoUrls: ["https://v.example/u.mp4"] })).error ?? "", /HTTP 503/);
    const net = stub([new Error("socket hang up")]);
    const result = await new AuddRecognitionProvider({ apiToken: "t", fetchImpl: net.fetchImpl }).identify({ ...input, videoUrls: ["https://v.example/u.mp4"] });
    assert.match(result.error ?? "", /could not be reached: socket hang up/);
    assert.deepEqual(result.matches, []);
  });

  test("a post with no video URL is 'no song identified' and costs no request", async () => {
    const { fetchImpl, calls } = stub([]);
    const result = await new AuddRecognitionProvider({ apiToken: "t", fetchImpl }).identify({ externalContentId: "p", videoUrls: [] });
    assert.deepEqual(result, { matches: [], error: null });
    assert.equal(calls.length, 0);
  });

  test("the API token never appears in an error message", async () => {
    const { fetchImpl } = stub([new Error("boom")]);
    const result = await new AuddRecognitionProvider({ apiToken: "super-secret-token", fetchImpl }).identify({ ...input, videoUrls: ["https://v.example/u.mp4"] });
    assert.ok(!(result.error ?? "").includes("super-secret-token"));
  });

  test("only https links are sent, and at most two per post", async () => {
    const { fetchImpl, calls } = stub([{ status: "error", error: { error_code: 600, error_message: "x" } }, { status: "error", error: { error_code: 600, error_message: "x" } }, { status: "error", error: { error_code: 600, error_message: "x" } }]);
    await new AuddRecognitionProvider({ apiToken: "t", fetchImpl }).identify({
      externalContentId: "p",
      videoUrls: ["javascript:alert(1)", "http://v.example/plain.mp4", "https://v.example/1.mp4", "https://v.example/2.mp4", "https://v.example/3.mp4"],
    });
    assert.deepEqual(calls.map((c) => c.body.get("url")), ["https://v.example/1.mp4", "https://v.example/2.mp4"]);
  });

  test("a post with only unusable links costs no request", async () => {
    const { fetchImpl, calls } = stub([]);
    const result = await new AuddRecognitionProvider({ apiToken: "t", fetchImpl }).identify({ externalContentId: "p", videoUrls: ["file:///etc/passwd"] });
    assert.deepEqual(result, { matches: [], error: null });
    assert.equal(calls.length, 0);
  });
});
