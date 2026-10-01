import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { prepareUserAccount, EMAIL_PATTERN, MIN_PASSWORD_LENGTH } from "./prepare-user-account";
import { verifyPassword } from "./password";
import { InMemoryUserRepository } from "./in-memory-repositories";

function makeDeps() {
  return { userRepository: new InMemoryUserRepository() };
}

/**
 * `signUp` and `acceptInvite` each have their own test files, and both
 * exercise every branch here indirectly. This file exists anyway, for the
 * same reason the project gives every implementation file a sibling test:
 * a future third caller shouldn't have to re-derive this coverage, and a
 * regression here should fail closest to its source.
 */
describe("prepareUserAccount", () => {
  test("normalizes the email and hashes the password, without writing anything", async () => {
    const deps = makeDeps();
    const result = await prepareUserAccount(
      { email: "  Jane@Acme.com  ", password: "correct horse", name: "Jane Doe" },
      deps,
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.account.email, "jane@acme.com", "email is trimmed and lowercased");
    assert.equal(result.account.name, "Jane Doe");
    assert.notEqual(result.account.passwordHash, "correct horse", "password is hashed, never kept in plaintext");
    assert.equal(await verifyPassword("correct horse", result.account.passwordHash), true);

    assert.equal(
      await deps.userRepository.findByEmail("jane@acme.com"),
      null,
      "nothing is persisted here — the account is written atomically with its membership",
    );
  });

  test("trims a given name, and defaults a blank or whitespace-only name to null", async () => {
    const deps = makeDeps();

    const padded = await prepareUserAccount({ email: "a@b.com", password: "correct horse", name: "  Jane  " }, deps);
    assert.ok(padded.ok);
    if (padded.ok) assert.equal(padded.account.name, "Jane");

    const blank = await prepareUserAccount({ email: "b@b.com", password: "correct horse", name: "   " }, deps);
    assert.ok(blank.ok);
    if (blank.ok) assert.equal(blank.account.name, null);

    const missing = await prepareUserAccount({ email: "c@b.com", password: "correct horse", name: null }, deps);
    assert.ok(missing.ok);
    if (missing.ok) assert.equal(missing.account.name, null);
  });

  test("rejects an invalid email", async () => {
    const result = await prepareUserAccount(
      { email: "not-an-email", password: "correct horse", name: null },
      makeDeps(),
    );
    assert.deepEqual(result, { ok: false, error: "INVALID_EMAIL" });
  });

  test("EMAIL_PATTERN rejects the shapes prepareUserAccount is expected to reject", () => {
    for (const bad of ["", "no-at-sign.com", "missing-domain@", "@missing-local.com", "spaces in@it.com"]) {
      assert.equal(EMAIL_PATTERN.test(bad), false, `expected "${bad}" to be invalid`);
    }
    for (const good of ["a@b.com", "jane.doe+tag@acme.co.uk"]) {
      assert.equal(EMAIL_PATTERN.test(good), true, `expected "${good}" to be valid`);
    }
  });

  test("rejects a password shorter than the minimum length, and accepts exactly the minimum", async () => {
    const tooShort = await prepareUserAccount(
      { email: "a@b.com", password: "x".repeat(MIN_PASSWORD_LENGTH - 1), name: null },
      makeDeps(),
    );
    assert.deepEqual(tooShort, { ok: false, error: "WEAK_PASSWORD" });

    const exactlyMin = await prepareUserAccount(
      { email: "a@b.com", password: "x".repeat(MIN_PASSWORD_LENGTH), name: null },
      makeDeps(),
    );
    assert.equal(exactlyMin.ok, true);
  });

  test("rejects an email that's already registered, case-insensitively", async () => {
    const deps = makeDeps();
    await deps.userRepository.create({ email: "dup@acme.com", passwordHash: "hash", name: null });
    const second = await prepareUserAccount(
      { email: "Dup@Acme.com", password: "another password", name: null },
      deps,
    );
    assert.deepEqual(second, { ok: false, error: "EMAIL_ALREADY_REGISTERED" });
  });
});
