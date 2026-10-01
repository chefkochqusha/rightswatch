import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeTikTokUsername, tikTokProfileUrl } from "./username";

describe("normalizeTikTokUsername", () => {
  test("strips the @ and lowercases", () => {
    assert.deepEqual(normalizeTikTokUsername("  @Lena.Creates "), { ok: true, username: "lena.creates" });
  });

  test("takes the username out of a pasted profile link", () => {
    for (const link of [
      "https://www.tiktok.com/@lena.creates",
      "https://www.tiktok.com/@lena.creates?lang=de",
      "tiktok.com/@lena.creates/video/7419000000000001001",
      "https://m.tiktok.com/@lena.creates/",
    ]) {
      assert.deepEqual(normalizeTikTokUsername(link), { ok: true, username: "lena.creates" }, link);
    }
  });

  test("accepts letters, numbers, underscores and periods up to 24 characters", () => {
    assert.equal(normalizeTikTokUsername("dan_builds.2026").ok, true);
    assert.equal(normalizeTikTokUsername("a".repeat(24)).ok, true);
  });

  test("rejects anything else", () => {
    for (const bad of ["a", "a".repeat(25), "lena creates", "lena-creates", "lena.", "läna", "https://example.com/@lena"]) {
      assert.deepEqual(normalizeTikTokUsername(bad), { ok: false, error: "USERNAME_INVALID" }, bad);
    }
  });

  test("an empty input is its own error", () => {
    assert.deepEqual(normalizeTikTokUsername("   "), { ok: false, error: "USERNAME_REQUIRED" });
  });

  test("builds the public profile link", () => {
    assert.equal(tikTokProfileUrl("lena.creates"), "https://www.tiktok.com/@lena.creates");
  });
});
