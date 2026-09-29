import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PLAN_CATALOG } from "./plan-catalog";

describe("PLAN_CATALOG", () => {
  test("has exactly one plan per tier", () => {
    const tiers = PLAN_CATALOG.map((plan) => plan.tier);
    assert.deepEqual(new Set(tiers).size, tiers.length);
    assert.deepEqual(new Set(tiers), new Set(["STARTER", "GROWTH", "AGENCY"]));
  });

  test("ids are unique", () => {
    const ids = PLAN_CATALOG.map((plan) => plan.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("price and creator cap both increase from Starter to Agency", () => {
    const starter = PLAN_CATALOG.find((plan) => plan.tier === "STARTER")!;
    const growth = PLAN_CATALOG.find((plan) => plan.tier === "GROWTH")!;
    const agency = PLAN_CATALOG.find((plan) => plan.tier === "AGENCY")!;

    assert.ok(starter.priceCents < growth.priceCents);
    assert.ok(growth.priceCents < agency.priceCents);
    assert.ok(starter.creatorCap < growth.creatorCap);
    assert.ok(growth.creatorCap < agency.creatorCap);
  });

  test("every plan has a positive price and creator cap", () => {
    for (const plan of PLAN_CATALOG) {
      assert.ok(plan.priceCents > 0, `${plan.tier} priceCents should be positive`);
      assert.ok(plan.creatorCap > 0, `${plan.tier} creatorCap should be positive`);
      assert.ok(plan.scanCadence.length > 0, `${plan.tier} should have a scanCadence`);
    }
  });
});
