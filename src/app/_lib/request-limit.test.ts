import assert from "node:assert/strict";
import { test } from "node:test";
import { clientIpFrom, spendRequest } from "./request-limit";

test("a key may spend its budget, then waits for the rest of the window", async () => {
  const budget = { max: 3, windowMs: 60_000 };
  const t0 = 1_000_000;
  assert.equal(await spendRequest("t-budget", "user-1", budget, t0), null);
  assert.equal(await spendRequest("t-budget", "user-1", budget, t0 + 1_000), null);
  assert.equal(await spendRequest("t-budget", "user-1", budget, t0 + 2_000), null);
  const wait = await spendRequest("t-budget", "user-1", budget, t0 + 3_000);
  assert.ok(wait !== null && wait > 0 && wait <= 60);
});

test("one key's spending does not touch another's, and the window ends", async () => {
  const budget = { max: 2, windowMs: 10_000 };
  const t0 = 5_000_000;
  await spendRequest("t-keys", "a", budget, t0);
  await spendRequest("t-keys", "a", budget, t0 + 1);
  assert.ok((await spendRequest("t-keys", "a", budget, t0 + 2)) !== null);
  assert.equal(await spendRequest("t-keys", "b", budget, t0 + 2), null);
  assert.equal(await spendRequest("t-keys", "a", budget, t0 + 11_000), null);
});

test("the client address is the first forwarded entry, or 'local'", () => {
  assert.equal(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIpFrom(new Headers()), "local");
});
