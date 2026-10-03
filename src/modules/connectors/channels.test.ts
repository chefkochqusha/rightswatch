import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANNEL_STAGES, isChannelLive, orderedChannels } from "./channels";

test("every platform has a stage and the beta channel comes first", () => {
  assert.deepEqual(Object.keys(CHANNEL_STAGES).sort(), ["INSTAGRAM", "TIKTOK", "YOUTUBE"]);
  assert.equal(orderedChannels()[0], "TIKTOK");
});

test("only TikTok is live in the beta", () => {
  assert.equal(isChannelLive("TIKTOK"), true);
  assert.equal(isChannelLive("INSTAGRAM"), false);
  assert.equal(isChannelLive("YOUTUBE"), false);
});
