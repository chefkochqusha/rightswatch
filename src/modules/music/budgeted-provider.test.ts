import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { BudgetedRecognitionProvider } from "./budgeted-provider";
import type { MusicIdentificationInput, MusicIdentificationProvider } from "./types";

function counting() {
  const seen: string[] = [];
  const inner: MusicIdentificationProvider = {
    providerName: "audd",
    async identify(input: MusicIdentificationInput) {
      seen.push(input.externalContentId);
      return { matches: [], error: null };
    },
  };
  return { inner, seen };
}

const post = (id: string, urls = ["https://v.example/a.mp4"]) => ({ externalContentId: id, videoUrls: urls });

describe("BudgetedRecognitionProvider", () => {
  test("passes posts through until the limit, then stops asking the service", async () => {
    const { inner, seen } = counting();
    const budget = new BudgetedRecognitionProvider(inner, 2);
    assert.equal((await budget.identify(post("1"))).error, null);
    assert.equal((await budget.identify(post("2"))).error, null);
    const third = await budget.identify(post("3"));
    assert.match(third.error ?? "", /limit for one scan reached \(2 posts\)/);
    assert.deepEqual(third.matches, []);
    assert.deepEqual(seen, ["1", "2"]);
  });

  test("posts without a video link cost nothing and don't use up the limit", async () => {
    const { inner, seen } = counting();
    const budget = new BudgetedRecognitionProvider(inner, 1);
    await budget.identify(post("no-video", []));
    await budget.identify(post("no-video-2", []));
    assert.equal((await budget.identify(post("1"))).error, null);
    assert.match((await budget.identify(post("2"))).error ?? "", /limit/);
    assert.deepEqual(seen, ["no-video", "no-video-2", "1"]);
  });

  test("keeps the name of the service it wraps", () => {
    assert.equal(new BudgetedRecognitionProvider(counting().inner, 5).providerName, "audd");
  });
});
