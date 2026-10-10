import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { legalDetailsFromEnv } from "./legal-details";

const COMPLETE = {
  IMPRESSUM_NAME: "Bekvor UG (haftungsbeschränkt)",
  IMPRESSUM_ADDRESS: "Musterstraße 1 | 10115 Berlin | Deutschland",
  IMPRESSUM_EMAIL: "hello@bekvor.com",
  IMPRESSUM_PHONE: "+49 30 1234567",
};

describe("legalDetailsFromEnv", () => {
  it("needs a name, a postal address, an email and a phone number", () => {
    assert.equal(legalDetailsFromEnv({}), null);
    for (const key of Object.keys(COMPLETE)) {
      assert.equal(legalDetailsFromEnv({ ...COMPLETE, [key]: "  " }), null, `${key} missing`);
    }
  });

  it("splits the address on | or new lines and fills the optional contacts from the main email", () => {
    const d = legalDetailsFromEnv(COMPLETE)!;
    assert.deepEqual(d.address, ["Musterstraße 1", "10115 Berlin", "Deutschland"]);
    assert.equal(d.dsaEmail, "hello@bekvor.com");
    assert.equal(d.privacyEmail, "hello@bekvor.com");
    assert.equal(d.vatId, null);
    assert.deepEqual(legalDetailsFromEnv({ ...COMPLETE, IMPRESSUM_ADDRESS: "A 1\n12345 B" })!.address, ["A 1", "12345 B"]);
  });

  it("uses separate DSA and privacy addresses when set", () => {
    const d = legalDetailsFromEnv({ ...COMPLETE, DSA_CONTACT_EMAIL: "dsa@bekvor.com", PRIVACY_EMAIL: "privacy@bekvor.com", IMPRESSUM_VAT_ID: "DE123456789" })!;
    assert.equal(d.dsaEmail, "dsa@bekvor.com");
    assert.equal(d.privacyEmail, "privacy@bekvor.com");
    assert.equal(d.vatId, "DE123456789");
  });
});
