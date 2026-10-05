import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MAX_POSTS_PER_SCAN, getRecognitionMode, getRecognitionProvider, maxPostsPerScan } from "./recognition";

const original = process.env.AUDD_API_TOKEN;
afterEach(() => {
  if (original === undefined) delete process.env.AUDD_API_TOKEN;
  else process.env.AUDD_API_TOKEN = original;
});

describe("recognition provider choice", () => {
  test("no token: nothing identifies songs", () => {
    delete process.env.AUDD_API_TOKEN;
    assert.equal(getRecognitionMode(), "NONE");
    assert.equal(getRecognitionProvider().providerName, "none");
  });

  test("a blank token counts as no token", () => {
    process.env.AUDD_API_TOKEN = "   ";
    assert.equal(getRecognitionMode(), "NONE");
  });

  test("a token switches AudD on", () => {
    process.env.AUDD_API_TOKEN = "abc";
    assert.equal(getRecognitionMode(), "AUDD");
    assert.equal(getRecognitionProvider().providerName, "audd");
  });

  test("the per-scan spending cap defaults to 200 posts and can be set, but never to nonsense", () => {
    assert.equal(DEFAULT_MAX_POSTS_PER_SCAN, 200);
    assert.equal(maxPostsPerScan(undefined), 200);
    assert.equal(maxPostsPerScan("50"), 50);
    for (const bad of ["0", "-5", "abc", "1.5", ""]) {
      assert.equal(maxPostsPerScan(bad), 200, bad);
    }
  });
});
