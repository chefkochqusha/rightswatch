import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { manualPostContent, parseManualPost } from "./manual-post";

const now = new Date("2026-10-10T10:00:00Z");
const base = { url: "https://www.tiktok.com/@Lena.Creates/video/7301234567890123456?is_from_webapp=1", publishedOn: "2026-10-01", brands: "Glow Co, Glow Co ,  Fizz", label: "", territory: "de" };

describe("parseManualPost", () => {
  it("takes a TikTok post link apart and cleans the rest", () => {
    const parsed = parseManualPost(base, now);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    assert.equal(parsed.post.videoId, "7301234567890123456");
    assert.equal(parsed.post.handle, "lena.creates");
    assert.equal(parsed.post.url, "https://www.tiktok.com/@Lena.Creates/video/7301234567890123456");
    assert.deepEqual(parsed.post.brandNames, ["Glow Co", "Fizz"]);
    assert.equal(parsed.post.label, "Paid partnership");
    assert.equal(parsed.post.territory, "DE");
    assert.equal(parsed.post.publishedAt.toISOString(), "2026-10-01T12:00:00.000Z");
  });

  it("accepts photo posts and m.tiktok.com", () => {
    assert.ok(parseManualPost({ ...base, url: "https://m.tiktok.com/@abc/photo/7301234567890123456" }, now).ok);
  });

  it("refuses other links, short links it can't read, and http", () => {
    for (const url of [
      "https://vm.tiktok.com/ZMabc123/",
      "https://www.tiktok.com.evil.example/@a/video/7301234567890123456",
      "http://www.tiktok.com/@abc/video/7301234567890123456",
      "https://www.instagram.com/p/abc",
      "https://www.instagram.com/lena.creates/",
      "https://www.instagram.com.evil.example/reel/C1a2B3c4D5e/",
      "http://www.instagram.com/reel/C1a2B3c4D5e/",
      "not a link",
    ]) {
      const parsed = parseManualPost({ ...base, url }, now);
      assert.ok(!parsed.ok && parsed.fieldErrors.url, url);
    }
  });

  it("reads Instagram post links, with or without the account in them", () => {
    const cases: [string, string, string | null][] = [
      ["https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=xyz", "https://www.instagram.com/reel/C1a2B3c4D5e/", null],
      ["https://instagram.com/reels/C1a2B3c4D5e", "https://www.instagram.com/reel/C1a2B3c4D5e/", null],
      ["https://www.instagram.com/p/DAbc_-12345/", "https://www.instagram.com/p/DAbc_-12345/", null],
      ["https://www.instagram.com/Lena.Creates/reel/C1a2B3c4D5e/", "https://www.instagram.com/reel/C1a2B3c4D5e/", "lena.creates"],
    ];
    for (const [url, canonical, handle] of cases) {
      const parsed = parseManualPost({ ...base, url }, now);
      assert.ok(parsed.ok, url);
      if (!parsed.ok) continue;
      assert.equal(parsed.post.platform, "INSTAGRAM");
      assert.equal(parsed.post.url, canonical);
      assert.equal(parsed.post.handle, handle);
      assert.equal(manualPostContent(parsed.post, { externalId: "lena.creates", handle: "lena.creates" }).platform, "INSTAGRAM");
    }
  });

  it("refuses impossible dates and bad country codes", () => {
    const check = (patch: Partial<typeof base>, field: string) => {
      const parsed = parseManualPost({ ...base, ...patch }, now);
      assert.ok(!parsed.ok && field in parsed.fieldErrors, JSON.stringify(patch));
    };
    check({ publishedOn: "2026-02-30" }, "publishedOn");
    check({ publishedOn: "2027-01-01" }, "publishedOn");
    check({ publishedOn: "2012-01-01" }, "publishedOn");
    check({ publishedOn: "" }, "publishedOn");
    check({ territory: "Germany" }, "territory");
    check({ brands: Array.from({ length: 11 }, (_, i) => `B${i}`).join(",") }, "brands");
  });

  it("allows no country and no brand", () => {
    const parsed = parseManualPost({ ...base, territory: "", brands: "" }, now);
    assert.ok(parsed.ok && parsed.post.territory === null && parsed.post.brandNames.length === 0);
  });
});

describe("manualPostContent", () => {
  it("is keyed by TikTok's own video id, so a later scan updates the same post", () => {
    const parsed = parseManualPost(base, now);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const content = manualPostContent(parsed.post, { externalId: "lena.creates", handle: "lena.creates" });
    assert.equal(content.externalContentId, "7301234567890123456");
    assert.equal(content.platform, "TIKTOK");
    assert.deepEqual(content.videoUrls, ["https://www.tiktok.com/@Lena.Creates/video/7301234567890123456"]);
  });
});
