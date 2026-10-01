import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { hashPassword, needsRehash, simulatePasswordCheck, verifyPassword } from "./password";

/** A hash in the format `hashPassword` wrote before hashes carried their own
 *  parameters: `<salt-hex>:<hash-hex>`, Node's scrypt defaults (p=1). */
function legacyHash(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

describe("password hashing", () => {
  test("a hashed password verifies successfully against the original", async () => {
    const hash = await hashPassword("correct horse battery staple");
    assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  });

  test("the wrong password fails verification", async () => {
    const hash = await hashPassword("correct horse battery staple");
    assert.equal(await verifyPassword("wrong password", hash), false);
  });

  test("hashing the same password twice produces different strings (random salt)", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    assert.notEqual(a, b);
    assert.equal(await verifyPassword("same password", a), true);
    assert.equal(await verifyPassword("same password", b), true);
  });

  test("a malformed stored hash fails closed instead of throwing", async () => {
    assert.equal(await verifyPassword("anything", "not-a-valid-hash"), false);
    assert.equal(await verifyPassword("anything", ""), false);
    assert.equal(await verifyPassword("anything", "scrypt$16384$8$5$zz$zz"), false);
    assert.equal(await verifyPassword("anything", "scrypt$16384$8$5$abcd"), false);
  });

  test("stores the cost parameters with the hash: scrypt$N$r$p$salt$hash at N=2^14, r=8, p=5", async () => {
    const parts = (await hashPassword("pw")).split("$");
    assert.deepEqual(parts.slice(0, 4), ["scrypt", "16384", "8", "5"]);
    assert.equal(parts[4].length, 32, "16-byte salt, hex");
    assert.equal(parts[5].length, 128, "64-byte key, hex");
  });

  test("refuses parameters that would ask for more memory than allowed, rather than running them", async () => {
    const salt = "00".repeat(16);
    const key = "00".repeat(64);
    assert.equal(await verifyPassword("pw", `scrypt$1048576$32$1$${salt}$${key}`), false);
    assert.equal(await verifyPassword("pw", `scrypt$1000$8$1$${salt}$${key}`), false, "N must be a power of two");
  });
});

describe("hashes written before parameters were stored", () => {
  test("still verify, so existing users can log in", async () => {
    const stored = legacyHash("old password");
    assert.equal(await verifyPassword("old password", stored), true);
    assert.equal(await verifyPassword("wrong", stored), false);
  });

  test("are flagged for re-hashing; current ones and unparseable ones are not", async () => {
    assert.equal(needsRehash(legacyHash("pw")), true);
    assert.equal(needsRehash(await hashPassword("pw")), false);
    assert.equal(needsRehash("scrypt$16384$8$1$" + "00".repeat(16) + "$" + "00".repeat(64)), true, "same format, older p");
    assert.equal(needsRehash("garbage"), false);
  });
});

describe("simulatePasswordCheck", () => {
  test("always resolves false", async () => {
    assert.equal(await simulatePasswordCheck("anything"), false);
  });

  test("costs about as much as verifying a real password, so it can stand in for one", async () => {
    const stored = await hashPassword("pw");
    const time = async (fn: () => Promise<unknown>) => {
      const start = performance.now();
      for (let i = 0; i < 3; i++) await fn();
      return performance.now() - start;
    };
    const real = await time(() => verifyPassword("wrong", stored));
    const simulated = await time(() => simulatePasswordCheck("wrong"));
    assert.ok(simulated > real * 0.5, `simulated ${simulated.toFixed(0)}ms vs real ${real.toFixed(0)}ms`);
  });
});
