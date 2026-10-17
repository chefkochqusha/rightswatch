import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeInstagramUsername, normalizeTikTokUsername, normalizeUsername, profileUrlFor, tikTokProfileUrl } from "./username";

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

describe("normalizeInstagramUsername", () => {
  test("strips the @, lowercases and reads a profile link", () => {
    for (const input of ["@Lena.Creates", "https://www.instagram.com/lena.creates/", "instagram.com/lena.creates?igsh=abc", "https://instagram.com/Lena.Creates"]) {
      assert.deepEqual(normalizeInstagramUsername(input), { ok: true, username: "lena.creates" }, input);
    }
  });

  test("accepts up to 30 letters, numbers, underscores and periods", () => {
    assert.equal(normalizeInstagramUsername("a".repeat(30)).ok, true);
    assert.equal(normalizeInstagramUsername("x").ok, true);
  });

  test("rejects periods at the ends or in a row, other characters, and post links", () => {
    for (const bad of [".lena", "lena.", "le..na", "a".repeat(31), "lena-creates", "https://www.instagram.com/reel/C1a2B3c4D5e/", "https://www.instagram.com/p/C1a2B3c4D5e/"]) {
      assert.deepEqual(normalizeInstagramUsername(bad), { ok: false, error: "USERNAME_INVALID" }, bad);
    }
    assert.deepEqual(normalizeInstagramUsername(" "), { ok: false, error: "USERNAME_REQUIRED" });
  });

  test("picks the platform's rules and profile link", () => {
    assert.deepEqual(normalizeUsername("INSTAGRAM", "a".repeat(30)), { ok: true, username: "a".repeat(30) });
    assert.equal(normalizeUsername("TIKTOK", "a".repeat(30)).ok, false);
    assert.equal(profileUrlFor("INSTAGRAM", "lena.creates"), "https://www.instagram.com/lena.creates/");
    assert.equal(profileUrlFor("TIKTOK", "lena.creates"), "https://www.tiktok.com/@lena.creates");
  });
});
