import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { slugify, generateUniqueSlug } from "./slug";

describe("slugify", () => {
  test("lowercases and hyphenates a normal name", () => {
    assert.equal(slugify("Acme Records"), "acme-records");
  });

  test("strips punctuation and collapses runs of separators", () => {
    assert.equal(slugify("Lumio & Co. — Skincare!!"), "lumio-co-skincare");
  });

  test("trims leading and trailing hyphens", () => {
    assert.equal(slugify("  --Acme--  "), "acme");
  });

  test("falls back to a generic slug for a name with no sluggable characters", () => {
    assert.equal(slugify("！！！"), "workspace");
    assert.equal(slugify(""), "workspace");
  });
});

describe("generateUniqueSlug", () => {
  test("returns the base slug when it isn't taken", async () => {
    const slug = await generateUniqueSlug("Acme Records", async () => false);
    assert.equal(slug, "acme-records");
  });

  test("appends -2, -3, ... until it finds a free slug", async () => {
    const taken = new Set(["acme-records", "acme-records-2", "acme-records-3"]);
    const slug = await generateUniqueSlug("Acme Records", async (candidate) =>
      taken.has(candidate),
    );
    assert.equal(slug, "acme-records-4");
  });

  test("throws rather than looping forever if every candidate is reported taken", async () => {
    await assert.rejects(() => generateUniqueSlug("Acme", async () => true));
  });
});
