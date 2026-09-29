import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { acceptInvite } from "./accept-invite";
import { createInviteToken } from "./invite-token";
import { verifyPassword } from "./password";
import { InMemoryUserRepository, InMemoryMembershipRepository } from "./in-memory-repositories";

const SECRET = "test-secret-do-not-use-in-real-env";

function makeDeps() {
  return {
    userRepository: new InMemoryUserRepository(),
    membershipRepository: new InMemoryMembershipRepository(),
    secret: SECRET,
  };
}

function makeToken(overrides: Partial<Parameters<typeof createInviteToken>[0]> = {}, now?: number) {
  return createInviteToken(
    {
      workspaceId: "workspace-1",
      workspaceName: "Acme Records",
      email: "newhire@acme.com",
      role: "ANALYST",
      ...overrides,
    },
    SECRET,
    now,
  );
}

describe("acceptInvite", () => {
  test("creates an account and a membership on the invited workspace/role, never a new workspace", async () => {
    const deps = makeDeps();
    const token = makeToken();

    const result = await acceptInvite(
      { token, password: "correct horse", name: "New Hire" },
      deps,
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.user.email, "newhire@acme.com");
    assert.equal(result.workspaceId, "workspace-1");
    assert.equal(result.workspaceName, "Acme Records");
    assert.equal(result.role, "ANALYST");

    const storedUser = await deps.userRepository.findByEmail("newhire@acme.com");
    assert.ok(storedUser);
    assert.notEqual(storedUser!.passwordHash, "correct horse", "password is hashed, never stored in plaintext");
    assert.equal(await verifyPassword("correct horse", storedUser!.passwordHash), true);

    const membership = await deps.membershipRepository.findForUserAndWorkspace(
      result.user.id,
      "workspace-1",
    );
    assert.equal(membership?.role, "ANALYST");

    // Exactly one membership was created — never a second workspace of its own.
    assert.equal((await deps.membershipRepository.findForUser(result.user.id)).length, 1);
  });

  test("defaults name to null when none is given", async () => {
    const result = await acceptInvite(
      { token: makeToken({ email: "noname@acme.com" }), password: "correct horse", name: null },
      makeDeps(),
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.user.name, null);
  });

  test("rejects a garbage token", async () => {
    const result = await acceptInvite(
      { token: "not-a-real-token", password: "correct horse", name: null },
      makeDeps(),
    );
    assert.deepEqual(result, { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  });

  test("rejects a token signed with a different secret", async () => {
    const token = createInviteToken(
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "a@b.com", role: "VIEWER" },
      "a-different-secret",
    );
    const result = await acceptInvite({ token, password: "correct horse", name: null }, makeDeps());
    assert.deepEqual(result, { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  });

  test("rejects an expired token", async () => {
    // acceptInvite has no `now` param of its own — verifyInviteToken defaults
    // to the real clock, so expiry (relative to *now*) is simulated by
    // minting a token whose 7-day window already closed 8 days ago.
    const expiredToken = createInviteToken(
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "a@b.com", role: "VIEWER" },
      SECRET,
      Date.now() - 8 * 24 * 60 * 60 * 1000,
    );
    const result = await acceptInvite(
      { token: expiredToken, password: "correct horse", name: null },
      makeDeps(),
    );
    assert.deepEqual(result, { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  });

  test("rejects a password shorter than 8 characters", async () => {
    const result = await acceptInvite(
      { token: makeToken(), password: "short", name: null },
      makeDeps(),
    );
    assert.deepEqual(result, { ok: false, error: "WEAK_PASSWORD" });
  });

  test("rejects re-accepting an invite whose email already has an account", async () => {
    const deps = makeDeps();
    const token = makeToken();

    const first = await acceptInvite({ token, password: "correct horse", name: null }, deps);
    assert.equal(first.ok, true);

    const second = await acceptInvite({ token, password: "another password", name: null }, deps);
    assert.deepEqual(second, { ok: false, error: "EMAIL_ALREADY_REGISTERED" });
  });

  test("rejects an invite whose email was registered independently before acceptance", async () => {
    const deps = makeDeps();
    await deps.userRepository.create({ email: "newhire@acme.com", passwordHash: "hash", name: null });

    const result = await acceptInvite(
      { token: makeToken(), password: "correct horse", name: null },
      deps,
    );
    assert.deepEqual(result, { ok: false, error: "EMAIL_ALREADY_REGISTERED" });
  });
});
