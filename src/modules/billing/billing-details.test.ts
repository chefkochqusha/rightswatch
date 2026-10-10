import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BILLING_COUNTRIES, normalizeVatId, parseBillingDetails, stripeTaxIdType, taxSituation, vatIdShapeError } from "./billing-details";

const BASE = { companyName: "Acme Records GmbH", addressLine1: "Musterstraße 1", postalCode: "10115", city: "Berlin", country: "DE" };

describe("parseBillingDetails", () => {
  it("accepts a German company without a VAT ID, and tidies the text", () => {
    const r = parseBillingDetails({ ...BASE, companyName: "  Acme   Records GmbH ", addressLine2: "  " });
    assert.ok(r.ok);
    assert.equal(r.details.companyName, "Acme Records GmbH");
    assert.equal(r.details.addressLine2, null);
    assert.equal(r.details.vatId, null);
  });

  it("names every missing field", () => {
    const r = parseBillingDetails({});
    assert.ok(!r.ok);
    assert.deepEqual(Object.keys(r.errors).sort(), ["addressLine1", "city", "companyName", "country", "postalCode"]);
  });

  it("needs a VAT ID from a business elsewhere in the EU, in that country's shape", () => {
    const missing = parseBillingDetails({ ...BASE, country: "FR" });
    assert.ok(!missing.ok);
    assert.match(missing.errors.vatId!, /VAT ID/);
    const wrongCountry = parseBillingDetails({ ...BASE, country: "FR", vatId: "DE123456789" });
    assert.ok(!wrongCountry.ok);
    assert.match(wrongCountry.errors.vatId!, /starts with FR/);
    const ok = parseBillingDetails({ ...BASE, country: "fr", vatId: "fr 12 345678901" });
    assert.ok(ok.ok);
    assert.equal(ok.details.country, "FR");
    assert.equal(ok.details.vatId, "FR12345678901");
  });

  it("uses EL for Greece", () => {
    assert.equal(vatIdShapeError("GR", "EL123456789"), null);
    assert.match(vatIdShapeError("GR", "GR123456789")!, /starts with EL/);
  });

  it("checks a German VAT ID's shape when one is given", () => {
    const r = parseBillingDetails({ ...BASE, vatId: "DE12" });
    assert.ok(r.ok, "shape only: DE plus 2–13 characters");
    const bad = parseBillingDetails({ ...BASE, vatId: "DE 123 456 789 0123 4567" });
    assert.ok(!bad.ok);
  });

  it("refuses countries we don't bill and overlong values", () => {
    assert.ok(!parseBillingDetails({ ...BASE, country: "XX" }).ok);
    const long = parseBillingDetails({ ...BASE, city: "x".repeat(101) });
    assert.ok(!long.ok);
    assert.match(long.errors.city!, /100/);
  });
});

describe("tax situation and Stripe tax ID type", () => {
  it("tells domestic, EU reverse charge and outside the EU apart", () => {
    assert.equal(taxSituation("DE"), "DOMESTIC");
    assert.equal(taxSituation("AT"), "EU_REVERSE_CHARGE");
    assert.equal(taxSituation("CH"), "OUTSIDE_EU");
  });
  it("maps countries to the tax ID types Stripe stores", () => {
    assert.equal(stripeTaxIdType("DE"), "eu_vat");
    assert.equal(stripeTaxIdType("GB"), "gb_vat");
    assert.equal(stripeTaxIdType("US"), null);
  });
  it("lists the 27 EU states and a few others", () => {
    assert.equal(BILLING_COUNTRIES.length, 35);
    assert.equal(new Set(BILLING_COUNTRIES).size, BILLING_COUNTRIES.length);
    assert.equal(normalizeVatId(" at u-123.456/78 "), "ATU12345678");
  });
});
