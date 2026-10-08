import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { signUp } from "./sign-up";
import { verifyPassword } from "./password";
import { UniqueConstraintError } from "./errors";
import {
  InMemoryUserRepository,
  InMemoryWorkspaceRepository,
  InMemoryMembershipRepository,
  InMemoryAccountRepository,
} from "./in-memory-repositories";
import type { AccountRepository } from "./types";

function makeDeps() {
  const userRepository = new InMemoryUserRepository();
  const workspaceRepository = new InMemoryWorkspaceRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  return {
    userRepository,
    workspaceRepository,
    membershipRepository,
    accountRepository: new InMemoryAccountRepository(userRepository, workspaceRepository, membershipRepository),
  };
}

const VALID = { email: "jane@acme.com", password: "correct horse", name: null, workspaceName: "Acme" };

describe("signUp", () => {
  test("creates a user, a workspace, and an OWNER membership tying them together", async () => {
    const deps = makeDeps();
    const result = await signUp(
      { email: "jane@acme.com", password: "correct horse", name: "Jane Doe", workspaceName: "Acme Records" },
      deps,
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.user.email, "jane@acme.com");
    assert.equal(result.workspace.name, "Acme Records");
    assert.equal(result.workspace.slug, "acme-records");

    const storedUser = await deps.userRepository.findByEmail("jane@acme.com");
    assert.ok(storedUser);
    assert.notEqual(storedUser!.passwordHash, "correct horse", "password is hashed, never stored in plaintext");
    assert.equal(await verifyPassword("correct horse", storedUser!.passwordHash), true);

    const membership = await deps.membershipRepository.findForUserAndWorkspace(result.user.id, result.workspace.id);
    assert.equal(membership?.role, "OWNER");
  });

  test("defaults name to null when none is given", async () => {
    const result = await signUp({ ...VALID, email: "a@b.com", workspaceName: "Team" }, makeDeps());
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.user.name, null);
  });

  test("rejects an invalid email without touching the repositories", async () => {
    const deps = makeDeps();
    const result = await signUp({ ...VALID, email: "not-an-email" }, deps);
    assert.deepEqual(result, { ok: false, error: "INVALID_EMAIL" });
    assert.equal(await deps.userRepository.findByEmail("not-an-email"), null);
  });

  test("rejects a password shorter than 8 characters", async () => {
    const result = await signUp({ ...VALID, password: "short" }, makeDeps());
    assert.deepEqual(result, { ok: false, error: "WEAK_PASSWORD" });
  });

  test("rejects a blank workspace name", async () => {
    const result = await signUp({ ...VALID, workspaceName: "   " }, makeDeps());
    assert.deepEqual(result, { ok: false, error: "MISSING_WORKSPACE_NAME" });
  });

  test("rejects signup with an email that's already registered", async () => {
    const deps = makeDeps();
    await signUp({ ...VALID, email: "dup@acme.com", workspaceName: "First" }, deps);
    const second = await signUp(
      { ...VALID, email: "Dup@Acme.com", password: "another password", workspaceName: "Second" },
      deps,
    );
    assert.deepEqual(second, { ok: false, error: "EMAIL_ALREADY_REGISTERED" });
  });

  test("two workspaces with the same name get distinct slugs", async () => {
    const deps = makeDeps();
    const first = await signUp({ ...VALID, email: "one@acme.com" }, deps);
    const second = await signUp({ ...VALID, email: "two@acme.com" }, deps);

    assert.ok(first.ok && second.ok);
    if (first.ok && second.ok) {
      assert.equal(first.workspace.slug, "acme");
      assert.equal(second.workspace.slug, "acme-2");
    }
  });
});

describe("signUp under concurrency (the account write is atomic)", () => {
  /** An AccountRepository that loses the first `failures` writes to a
   *  concurrent signup, then delegates — as the database's unique index does. */
  function racing(inner: AccountRepository, field: "email" | "slug" | "unknown", failures: number, onFail?: () => Promise<void>) {
    let remaining = failures;
    const calls: string[] = [];
    const repo: AccountRepository = {
      async createAccount(input) {
        calls.push("newSlug" in input.workspace ? input.workspace.newSlug : input.workspace.existingId);
        if (remaining > 0) {
          remaining -= 1;
          await onFail?.();
          throw new UniqueConstraintError(field);
        }
        return inner.createAccount(input);
      },
      deleteWorkspace: (id) => inner.deleteWorkspace(id),
      deleteUser: (id) => inner.deleteUser(id),
    };
    return { repo, calls };
  }

  test("a slug taken between the check and the write is retried with a fresh slug", async () => {
    const deps = makeDeps();
    // The concurrent signup claims "acme" right as this one writes.
    const { repo, calls } = racing(deps.accountRepository, "slug", 1, async () => {
      await deps.workspaceRepository.create({ name: "Acme", slug: "acme" });
    });

    const result = await signUp(VALID, { ...deps, accountRepository: repo });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.workspace.slug, "acme-2");
    assert.deepEqual(calls, ["acme", "acme-2"]);
  });

  test("the same email signing up twice at once: the loser gets EMAIL_ALREADY_REGISTERED, not an error", async () => {
    const deps = makeDeps();
    const { repo } = racing(deps.accountRepository, "unknown", 1, async () => {
      // The other request's account lands first.
      await deps.userRepository.create({ email: "jane@acme.com", passwordHash: "x", name: null });
    });

    const result = await signUp(VALID, { ...deps, accountRepository: repo });
    assert.deepEqual(result, { ok: false, error: "EMAIL_ALREADY_REGISTERED" });
  });

  test("gives up after three collisions instead of looping", async () => {
    const deps = makeDeps();
    const { repo, calls } = racing(deps.accountRepository, "slug", 10);
    await assert.rejects(() => signUp(VALID, { ...deps, accountRepository: repo }), UniqueConstraintError);
    assert.equal(calls.length, 3);
  });

  test("any other failure propagates, and leaves no user without a workspace behind", async () => {
    const deps = makeDeps();
    const failing: AccountRepository = {
      async createAccount() {
        throw new Error("connection reset");
      },
      async deleteWorkspace() {},
      async deleteUser() {},
    };
    await assert.rejects(() => signUp(VALID, { ...deps, accountRepository: failing }), /connection reset/);
    assert.equal(await deps.userRepository.findByEmail("jane@acme.com"), null);

    // …so the same email can simply try again.
    const retry = await signUp(VALID, deps);
    assert.equal(retry.ok, true);
  });
});
