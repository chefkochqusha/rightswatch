import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { signUp } from "./sign-up";
import { verifyPassword } from "./password";
import {
  InMemoryUserRepository,
  InMemoryWorkspaceRepository,
  InMemoryMembershipRepository,
} from "./in-memory-repositories";

function makeDeps() {
  return {
    userRepository: new InMemoryUserRepository(),
    workspaceRepository: new InMemoryWorkspaceRepository(),
    membershipRepository: new InMemoryMembershipRepository(),
  };
}

describe("signUp", () => {
  test("creates a user, a workspace, and an OWNER membership tying them together", async () => {
    const deps = makeDeps();
    const result = await signUp(
      {
        email: "jane@acme.com",
        password: "correct horse",
        name: "Jane Doe",
        workspaceName: "Acme Records",
      },
      deps,
    );

    assert.equal(result.ok, true);
    if (!result.ok) return; // narrows for TypeScript below

    assert.equal(result.user.email, "jane@acme.com");
    assert.equal(result.workspace.name, "Acme Records");
    assert.equal(result.workspace.slug, "acme-records");

    const storedUser = await deps.userRepository.findByEmail("jane@acme.com");
    assert.ok(storedUser);
    assert.notEqual(storedUser!.passwordHash, "correct horse", "password is hashed, never stored in plaintext");
    assert.equal(await verifyPassword("correct horse", storedUser!.passwordHash), true);

    const membership = await deps.membershipRepository.findForUserAndWorkspace(
      result.user.id,
      result.workspace.id,
    );
    assert.equal(membership?.role, "OWNER");
  });

  test("defaults name to null when none is given", async () => {
    const result = await signUp(
      { email: "a@b.com", password: "correct horse", name: null, workspaceName: "Team" },
      makeDeps(),
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.user.name, null);
  });

  test("rejects an invalid email without touching the repositories", async () => {
    const deps = makeDeps();
    const result = await signUp(
      { email: "not-an-email", password: "correct horse", name: null, workspaceName: "Team" },
      deps,
    );
    assert.deepEqual(result, { ok: false, error: "INVALID_EMAIL" });
    assert.equal(await deps.userRepository.findByEmail("not-an-email"), null);
  });

  test("rejects a password shorter than 8 characters", async () => {
    const result = await signUp(
      { email: "a@b.com", password: "short", name: null, workspaceName: "Team" },
      makeDeps(),
    );
    assert.deepEqual(result, { ok: false, error: "WEAK_PASSWORD" });
  });

  test("rejects a blank workspace name", async () => {
    const result = await signUp(
      { email: "a@b.com", password: "correct horse", name: null, workspaceName: "   " },
      makeDeps(),
    );
    assert.deepEqual(result, { ok: false, error: "MISSING_WORKSPACE_NAME" });
  });

  test("rejects signup with an email that's already registered", async () => {
    const deps = makeDeps();
    await signUp(
      { email: "dup@acme.com", password: "correct horse", name: null, workspaceName: "First" },
      deps,
    );
    const second = await signUp(
      { email: "Dup@Acme.com", password: "another password", name: null, workspaceName: "Second" },
      deps,
    );
    assert.deepEqual(second, { ok: false, error: "EMAIL_ALREADY_REGISTERED" });
  });

  test("two workspaces with the same name get distinct slugs", async () => {
    const deps = makeDeps();
    const first = await signUp(
      { email: "one@acme.com", password: "correct horse", name: null, workspaceName: "Acme" },
      deps,
    );
    const second = await signUp(
      { email: "two@acme.com", password: "correct horse", name: null, workspaceName: "Acme" },
      deps,
    );

    assert.ok(first.ok && second.ok);
    if (first.ok && second.ok) {
      assert.equal(first.workspace.slug, "acme");
      assert.equal(second.workspace.slug, "acme-2");
    }
  });
});
