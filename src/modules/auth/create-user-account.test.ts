import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createUserAccount, EMAIL_PATTERN, MIN_PASSWORD_LENGTH } from "./create-user-account";
import { verifyPassword } from "./password";
import { InMemoryUserRepository } from "./in-memory-repositories";

function makeDeps() {
  return { userRepository: new InMemoryUserRepository() };
}

/**
 * `signUp` and `acceptInvite` each have their own test files, and both
 * already exercise every branch here indirectly (see their "rejects an
 * invalid email" / "rejects a password shorter than 8 characters" /
 * "rejects ... already registered" cases). This file exists anyway, for
 * the same reason the project gives every other implementation file a
 * sibling test rather than relying on callers to cover it transitively:
 * a future third caller shouldn't have to re-derive this coverage, and a
 * regression here should fail closest to its actual source.
 */
describe("createUserAccount", () => {
  test("creates a user with a normalized email and a hashed password", async () => {
    const deps = makeDeps();
    const result = await createUserAccount(
      { email: "  Jane@Acme.com  ", password: "correct horse", name: "Jane Doe" },
      deps,
    );

    assert.equal(result.ok, true);
    if (!result.ok) return; // narrows for TypeScript below

    assert.equal(result.user.email, "jane@acme.com", "email is trimmed and lowercased");
    assert.equal(result.user.name, "Jane Doe");
    assert.notEqual(
      result.user.passwordHash,
      "correct horse",
      "password is hashed, never stored in plaintext",
    );
    assert.equal(await verifyPassword("correct horse", result.user.passwordHash), true);

    const stored = await deps.userRepository.findByEmail("jane@acme.com");
    assert.ok(stored, "the account is actually persisted through the repository, not just returned");
  });

  test("trims a given name, and defaults a blank or whitespace-only name to null", async () => {
    const deps = makeDeps();

    const padded = await createUserAccount(
      { email: "a@b.com", password: "correct horse", name: "  Jane  " },
      deps,
    );
    assert.ok(padded.ok);
    if (padded.ok) assert.equal(padded.user.name, "Jane");

    const blank = await createUserAccount(
      { email: "b@b.com", password: "correct horse", name: "   " },
      deps,
    );
    assert.ok(blank.ok);
    if (blank.ok) assert.equal(blank.user.name, null);

    const missing = await createUserAccount(
      { email: "c@b.com", password: "correct horse", name: null },
      deps,
    );
    assert.ok(missing.ok);
    if (missing.ok) assert.equal(missing.user.name, null);
  });

  test("rejects an invalid email without touching the repository", async () => {
    const deps = makeDeps();
    const result = await createUserAccount(
      { email: "not-an-email", password: "correct horse", name: null },
      deps,
    );
    assert.deepEqual(result, { ok: false, error: "INVALID_EMAIL" });
    assert.equal(await deps.userRepository.findByEmail("not-an-email"), null);
  });

  test("EMAIL_PATTERN rejects the shapes createUserAccount is expected to reject", () => {
    for (const bad of ["", "no-at-sign.com", "missing-domain@", "@missing-local.com", "spaces in@it.com"]) {
      assert.equal(EMAIL_PATTERN.test(bad), false, `expected "${bad}" to be invalid`);
    }
    for (const good of ["a@b.com", "jane.doe+tag@acme.co.uk"]) {
      assert.equal(EMAIL_PATTERN.test(good), true, `expected "${good}" to be valid`);
    }
  });

  test("rejects a password shorter than the minimum length, and accepts exactly the minimum", async () => {
    const tooShort = await createUserAccount(
      { email: "a@b.com", password: "x".repeat(MIN_PASSWORD_LENGTH - 1), name: null },
      makeDeps(),
    );
    assert.deepEqual(tooShort, { ok: false, error: "WEAK_PASSWORD" });

    const exactlyMin = await createUserAccount(
      { email: "a@b.com", password: "x".repeat(MIN_PASSWORD_LENGTH), name: null },
      makeDeps(),
    );
    assert.equal(exactlyMin.ok, true);
  });

  test("rejects an email that's already registered, case-insensitively", async () => {
    const deps = makeDeps();
    await createUserAccount({ email: "dup@acme.com", password: "correct horse", name: null }, deps);
    const second = await createUserAccount(
      { email: "Dup@Acme.com", password: "another password", name: null },
      deps,
    );
    assert.deepEqual(second, { ok: false, error: "EMAIL_ALREADY_REGISTERED" });
  });
});
