import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DEMO_AS_OF, DEMO_SCENARIO_IDS, demoContentFor, demoIdentificationFor } from "./content";
import { DEMO_CREATORS } from "./creators";

const SEPTEMBER_START = new Date("2026-09-01T00:00:00Z");
const OCTOBER_END = new Date("2026-10-31T23:59:59Z");

describe("demoContentFor", () => {
  test("gives the named creators their scenarios up to the snapshot, then generated posts", () => {
    const posts = demoContentFor("lena.creates", SEPTEMBER_START, OCTOBER_END);
    const scenario = posts.filter((post) => !post.externalContentId.startsWith("DEMO-V-G"));
    const generated = posts.filter((post) => post.externalContentId.startsWith("DEMO-V-G"));
    assert.deepEqual(
      scenario.map((post) => post.externalContentId),
      ["DEMO-V-1002", "DEMO-V-1001"],
    );
    assert.ok(generated.length > 0, "expected generated posts in October");
    assert.ok(generated.every((post) => post.publishedAt > DEMO_AS_OF));
  });

  test("is deterministic and keeps ids stable across overlapping windows", () => {
    const wide = demoContentFor("someone.new", SEPTEMBER_START, OCTOBER_END);
    const again = demoContentFor("someone.new", SEPTEMBER_START, OCTOBER_END);
    assert.equal(JSON.stringify(wide), JSON.stringify(again));

    // A narrower window returns a subset of the same posts, not new ones —
    // which is what keeps a re-scan from duplicating anything.
    const narrow = demoContentFor("someone.new", new Date("2026-10-01T00:00:00Z"), OCTOBER_END);
    const wideIds = new Set(wide.map((post) => post.externalContentId));
    assert.ok(narrow.every((post) => wideIds.has(post.externalContentId)));
  });

  test("never publishes outside the requested window", () => {
    const since = new Date("2026-09-10T00:00:00Z");
    const until = new Date("2026-09-20T00:00:00Z");
    for (const creator of DEMO_CREATORS) {
      for (const post of demoContentFor(creator.handle, since, until)) {
        assert.ok(post.publishedAt >= since && post.publishedAt <= until, post.externalContentId);
      }
    }
  });

  test("ids are unique across creators and days", () => {
    const ids = DEMO_CREATORS.flatMap((creator) =>
      demoContentFor(creator.handle, SEPTEMBER_START, OCTOBER_END).map((post) => post.externalContentId),
    );
    assert.equal(new Set(ids).size, ids.length);
  });

  test("nothing is generated before June 2026", () => {
    assert.deepEqual(demoContentFor("someone.new", new Date("2020-01-01"), new Date("2026-05-31T23:59:59Z")), []);
  });
});

describe("demoIdentificationFor", () => {
  test("answers every scenario as written", () => {
    assert.equal(DEMO_SCENARIO_IDS.length, 15);
    assert.deepEqual(demoIdentificationFor("DEMO-V-1001"), { kind: "match", track: "midnightRun", confidence: 0.974 });
    assert.deepEqual(demoIdentificationFor("DEMO-V-5002"), { kind: "none" });
    assert.deepEqual(demoIdentificationFor("DEMO-V-6002"), { kind: "error" });
  });

  test("is deterministic for generated posts, and silent about anything that isn't demo content", () => {
    const [post] = demoContentFor("someone.new", SEPTEMBER_START, OCTOBER_END);
    assert.deepEqual(demoIdentificationFor(post.externalContentId), demoIdentificationFor(post.externalContentId));
    assert.deepEqual(demoIdentificationFor("7300000000000000001"), { kind: "none" });
  });
});
