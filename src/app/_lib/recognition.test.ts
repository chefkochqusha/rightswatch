import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { getRecognitionMode, getRecognitionProvider } from "./recognition";

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
});
