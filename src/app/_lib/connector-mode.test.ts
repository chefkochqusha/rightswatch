import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { connectedPlatforms, dataModeFor, getConnectorMode, getMetaCredentials, getTikTokCredentials } from "./connector-mode";

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

  test("Instagram alone is enough for real mode, and needs both token and account id", () => {
    assert.equal(getConnectorMode({ META_ACCESS_TOKEN: "t" }), "DEMO");
    assert.equal(getConnectorMode({ META_IG_USER_ID: "1784" }), "DEMO");
    assert.equal(getConnectorMode({ META_ACCESS_TOKEN: "t", META_IG_USER_ID: "1784" }), "REAL");
    assert.equal(getConnectorMode({ META_ACCESS_TOKEN: "t", META_IG_USER_ID: "1784", DEMO_MODE: "TRUE" }), "DEMO");
  });

  test("lists which platforms are connected", () => {
    const tiktok = { TIKTOK_CLIENT_KEY: "k", TIKTOK_CLIENT_SECRET: "s" };
    const meta = { META_ACCESS_TOKEN: "t", META_IG_USER_ID: "1784" };
    assert.deepEqual(connectedPlatforms({}), []);
    assert.deepEqual(connectedPlatforms(tiktok), ["TIKTOK"]);
    assert.deepEqual(connectedPlatforms(meta), ["INSTAGRAM"]);
    assert.deepEqual(connectedPlatforms({ ...tiktok, ...meta }), ["TIKTOK", "INSTAGRAM"]);
    assert.deepEqual(connectedPlatforms({ ...tiktok, ...meta, DEMO_MODE: "true" }), []);
  });

  test("Meta credentials are trimmed, the optional parts null when empty", () => {
    assert.deepEqual(getMetaCredentials({ META_ACCESS_TOKEN: " t ", META_IG_USER_ID: "1784\n", META_APP_SECRET: " ", META_GRAPH_VERSION: "v26.0" }), {
      accessToken: "t",
      igUserId: "1784",
      appSecret: null,
      graphVersion: "v26.0",
    });
  });
});
