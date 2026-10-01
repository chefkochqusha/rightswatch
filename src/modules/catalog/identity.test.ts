import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findSameTrack, looseName, normalizeIsrc, sameTrack } from "./identity";

describe("normalizeIsrc", () => {
  test("accepts the ways an ISRC is written", () => {
    assert.equal(normalizeIsrc("USUM71900001"), "USUM71900001");
    assert.equal(normalizeIsrc(" us-um7-19-00001 "), "USUM71900001");
    assert.equal(normalizeIsrc("DEMO12600003"), "DEMO12600003");
  });

  test("rejects what isn't one", () => {
    for (const bad of ["", "USUM7190000", "1SUM71900001", "USUM7190000X", "hello"]) {
      assert.equal(normalizeIsrc(bad), null, bad);
    }
    assert.equal(normalizeIsrc(null), null);
  });
});

describe("looseName", () => {
  test("ignores case, accents, punctuation and featured artists", () => {
    assert.equal(looseName("Beyoncé"), "beyonce");
    assert.equal(looseName("Golden Hour (feat. Riva)"), "golden hour");
    assert.equal(looseName("Golden Hour ft. Riva"), "golden hour");
    assert.equal(looseName("Simon & Garfunkel"), "simon and garfunkel");
    assert.equal(looseName("  Still   Here! "), "still here");
  });
});

describe("sameTrack / findSameTrack", () => {
  const midnight = { isrc: "DEMO12600001", title: "Midnight Run", artist: "Aiko" };

  test("an ISRC on both sides decides, even against matching names", () => {
    assert.equal(sameTrack(midnight, { isrc: "DEMO12600001", title: "Midnight Run (Radio Edit)", artist: "AIKO" }), true);
    assert.equal(sameTrack(midnight, { isrc: "DEMO12600009", title: "Midnight Run", artist: "Aiko" }), false);
  });

  test("without ISRCs, loose title and artist decide", () => {
    assert.equal(sameTrack({ isrc: null, title: "midnight run", artist: "aiko" }, midnight), true);
    assert.equal(sameTrack({ isrc: null, title: "Midnight Run", artist: "Someone Else" }, midnight), false);
  });

  test("prefers an ISRC match over an earlier name match", () => {
    const sameName = { id: "a", isrc: null, title: "Midnight Run", artist: "Aiko" };
    const sameIsrc = { id: "b", isrc: "DEMO12600001", title: "Midnight Run", artist: "Aiko" };
    assert.equal(findSameTrack([sameName, sameIsrc], midnight)?.id, "b");
    assert.equal(findSameTrack([sameName], { isrc: null, title: "Midnight Run", artist: "Aiko" })?.id, "a");
    assert.equal(findSameTrack([sameName], { isrc: null, title: "Signals", artist: "Kova" }), null);
  });
});
