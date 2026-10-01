import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCreatorDetails } from "./details";
import { COUNTRY_CODES, normalizeCountryCode } from "./countries";

describe("parseCreatorDetails", () => {
  test("empty fields mean unknown", () => {
    assert.deepEqual(parseCreatorDetails({ displayName: " ", country: "", followerCount: "" }), {
      ok: true,
      details: { displayName: null, country: null, followerCount: null },
    });
    assert.deepEqual(parseCreatorDetails({}), {
      ok: true,
      details: { displayName: null, country: null, followerCount: null },
    });
  });

  test("trims the display name and uppercases the country", () => {
    const result = parseCreatorDetails({ displayName: "  Lena Creates ", country: "de" });
    assert.deepEqual(result, { ok: true, details: { displayName: "Lena Creates", country: "DE", followerCount: null } });
  });

  test("reads follower counts the way people write them", () => {
    const cases: [string | number, number][] = [
      ["182000", 182_000],
      ["182,000", 182_000],
      ["182.000", 182_000],
      ["182 000", 182_000],
      ["182K", 182_000],
      ["1.2M", 1_200_000],
      ["1,5m", 1_500_000],
      [96_000, 96_000],
      ["0", 0],
    ];
    for (const [input, expected] of cases) {
      const result = parseCreatorDetails({ followerCount: input });
      assert.deepEqual(result, { ok: true, details: { displayName: null, country: null, followerCount: expected } }, String(input));
    }
  });

  test("rejects what isn't a count, a country, or a reasonable name", () => {
    for (const followerCount of ["lots", "-5", "1.5", "18,20", 1.5, -1, "3000000000"]) {
      assert.deepEqual(parseCreatorDetails({ followerCount }), { ok: false, error: "FOLLOWERS_INVALID" }, String(followerCount));
    }
    assert.deepEqual(parseCreatorDetails({ country: "Germany" }), { ok: false, error: "COUNTRY_INVALID" });
    assert.deepEqual(parseCreatorDetails({ country: "XX" }), { ok: false, error: "COUNTRY_INVALID" });
    assert.deepEqual(parseCreatorDetails({ displayName: "x".repeat(81) }), { ok: false, error: "DISPLAY_NAME_TOO_LONG" });
  });
});

describe("country codes", () => {
  test("cover ISO 3166-1's 249 codes, each once", () => {
    assert.equal(COUNTRY_CODES.length, 249);
    assert.equal(new Set(COUNTRY_CODES).size, 249);
  });

  test("normalize case and reject unknown codes", () => {
    assert.equal(normalizeCountryCode(" at "), "AT");
    assert.equal(normalizeCountryCode("UK"), null, "the ISO code for the United Kingdom is GB");
  });
});
