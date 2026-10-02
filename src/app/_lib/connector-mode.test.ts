import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { dataModeFor, getConnectorMode, getTikTokCredentials } from "./connector-mode";

describe("connector mode", () => {
  test("is demo until both TikTok credentials are set", () => {
    assert.equal(getConnectorMode({}), "DEMO");
    assert.equal(getConnectorMode({ TIKTOK_CLIENT_KEY: "k" }), "DEMO");
    assert.equal(getConnectorMode({ TIKTOK_CLIENT_KEY: "k", TIKTOK_CLIENT_SECRET: " " }), "DEMO");
    assert.equal(getConnectorMode({ TIKTOK_CLIENT_KEY: "k", TIKTOK_CLIENT_SECRET: "s" }), "REAL");
  });

  test("DEMO_MODE=true forces demo even with credentials", () => {
    assert.equal(getConnectorMode({ TIKTOK_CLIENT_KEY: "k", TIKTOK_CLIENT_SECRET: "s", DEMO_MODE: "true" }), "DEMO");
    assert.equal(getConnectorMode({ TIKTOK_CLIENT_KEY: "k", TIKTOK_CLIENT_SECRET: "s", DEMO_MODE: "false" }), "REAL");
  });

  test("the public demo workspace stays demo when the app is connected", () => {
    const env = { TIKTOK_CLIENT_KEY: "k", TIKTOK_CLIENT_SECRET: "s" };
    assert.equal(dataModeFor({ slug: "northstar-demo" }, env), "DEMO");
    assert.equal(dataModeFor({ slug: "acme" }, env), "REAL");
  });

  test("credentials are trimmed", () => {
    assert.deepEqual(getTikTokCredentials({ TIKTOK_CLIENT_KEY: " k ", TIKTOK_CLIENT_SECRET: "s\n" }), { clientKey: "k", clientSecret: "s" });
  });
});
