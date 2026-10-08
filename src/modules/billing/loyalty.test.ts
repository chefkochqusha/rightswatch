import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { annualPriceCents, loyaltyMonth, loyaltyPercent, loyaltyStatus, monthOfMaxDiscount, monthlyPriceCents, startOfLoyaltyMonth } from "./loyalty";

describe("loyalty pricing", () => {
  test("month 1 full price, month 2 −10 %, then −2 % a month, capped at −30 % from month 12", () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 40].map(loyaltyPercent), [0, 10, 12, 14, 28, 30, 30, 30]);
    assert.equal(monthOfMaxDiscount(), 12);
    assert.equal(loyaltyPercent(0), 0);
    assert.equal(loyaltyPercent(Number.NaN), 0);
  });

  test("prices: monthly with the loyalty step, annual at −30 % for twelve months", () => {
    const plan = { priceCents: 29_900 };
    assert.equal(monthlyPriceCents(plan, "MONTHLY", 1), 29_900);
    assert.equal(monthlyPriceCents(plan, "MONTHLY", 2), 26_910);
    assert.equal(monthlyPriceCents(plan, "MONTHLY", 12), 20_930);
    assert.equal(monthlyPriceCents(plan, "ANNUAL", 1), 20_930);
    assert.equal(annualPriceCents(plan), 251_160);
  });

  test("loyalty months count calendar months from the start", () => {
    const start = new Date("2026-01-31T10:00:00Z");
    assert.equal(loyaltyMonth(null, new Date("2027-01-01Z")), 1);
    assert.equal(loyaltyMonth(start, new Date("2026-01-01Z")), 1);
    assert.equal(loyaltyMonth(start, new Date("2026-02-27Z")), 1);
    assert.equal(loyaltyMonth(start, new Date("2026-03-01Z")), 2);
    assert.equal(loyaltyMonth(new Date("2026-01-15Z"), new Date("2027-01-15Z")), 13);
    assert.equal(startOfLoyaltyMonth(new Date("2026-01-15Z"), 3).toISOString().slice(0, 10), "2026-03-15");
  });

  test("status shows today's discount and the next step", () => {
    const start = new Date("2026-01-15Z");
    const s = loyaltyStatus({ billingInterval: "MONTHLY", loyaltyStartedAt: start }, new Date("2026-02-20Z"));
    assert.equal(s.month, 2);
    assert.equal(s.percent, 10);
    assert.equal(s.next?.percent, 12);
    assert.equal(s.next?.from.toISOString().slice(0, 10), "2026-03-15");
    assert.equal(loyaltyStatus({ billingInterval: "MONTHLY", loyaltyStartedAt: start }, new Date("2027-06-01Z")).next, null);
    assert.deepEqual(loyaltyStatus({ billingInterval: "ANNUAL", loyaltyStartedAt: start }, new Date("2026-02-20Z")), { percent: 30, month: 1, next: null });
  });
});
