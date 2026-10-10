import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { vatIdStatusFromStripe } from "./stripe-billing-details";

describe("vatIdStatusFromStripe", () => {
  it("maps Stripe's VIES answers to ours", () => {
    const v = (status: string) => ({ status, verified_address: null, verified_name: null }) as never;
    assert.equal(vatIdStatusFromStripe(v("verified")), "VERIFIED");
    assert.equal(vatIdStatusFromStripe(v("unverified")), "UNVERIFIED");
    assert.equal(vatIdStatusFromStripe(v("unavailable")), "UNAVAILABLE");
    assert.equal(vatIdStatusFromStripe(v("pending")), "PENDING");
  });
  it("treats a tax ID Stripe doesn't check as format-checked only", () => {
    assert.equal(vatIdStatusFromStripe(null), "FORMAT_OK");
  });
});
