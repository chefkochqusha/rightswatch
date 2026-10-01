import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { COVER_PALETTES, artworkSrc, generatedCover } from "./artwork";

describe("generatedCover", () => {
  test("the same song always gets the same cover; case and spacing don't matter", () => {
    assert.deepEqual(generatedCover("Midnight Run", "Aiko"), generatedCover(" midnight run ", "AIKO"));
  });

  test("covers vary across songs, and use the palettes", () => {
    const titles = ["Midnight Run", "Golden Hour", "Signals", "Afterglow", "Still Here", "City Lights", "Paper Planes", "Coastline"];
    const covers = titles.map((title) => generatedCover(title, "Someone"));
    assert.ok(new Set(covers.map((cover) => `${cover.background}|${cover.motif}`)).size >= 5);
    for (const cover of covers) {
      assert.ok(COVER_PALETTES.some(([background]) => background === cover.background));
      assert.ok(cover.variation >= 0 && cover.variation < 1);
    }
  });

  test("the monogram is the title's first letter or digit", () => {
    assert.equal(generatedCover("“99 Problems”", null).initial, "9");
    assert.equal(generatedCover("éclair", null).initial, "É");
    assert.equal(generatedCover("—", null).initial, "♪");
  });
});

describe("artworkSrc", () => {
  test("a Cover Art Archive front cover goes through this app's artwork route", () => {
    assert.equal(
      artworkSrc("https://coverartarchive.org/release/1b7e7e3c-0a5b-4f5e-9b54-55c7a2e0c0f1/front-250"),
      "/api/v1/artwork/1b7e7e3c-0a5b-4f5e-9b54-55c7a2e0c0f1",
    );
  });

  test("anything else isn't loaded at all", () => {
    assert.equal(artworkSrc(null), null);
    assert.equal(artworkSrc("https://example.com/cover.jpg"), null);
    assert.equal(artworkSrc("https://coverartarchive.org/release/not-a-uuid/front-250"), null);
  });
});
