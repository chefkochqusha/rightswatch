import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { acceptInvite } from "./accept-invite";
import { createInviteToken } from "./invite-token";
import { verifyPassword } from "./password";
import {
  InMemoryUserRepository,
  InMemoryWorkspaceRepository,
  InMemoryMembershipRepository,
  InMemoryAccountRepository,
} from "./in-memory-repositories";

const SECRET = "test-secret-do-not-use-in-real-env";

async function makeDeps() {
  const userRepository = new InMemoryUserRepository();
  const workspaceRepository = new InMemoryWorkspaceRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const workspace = await workspaceRepository.create({ name: "Acme Records", slug: "acme-records" });
  return {
    deps: {
      userRepository,
      accountRepository: new InMemoryAccountRepository(userRepository, workspaceRepository, membershipRepository),
      secret: SECRET,
    },
    membershipRepository,
    workspaceId: workspace.id,
  };
}

function makeToken(
  workspaceId: string,
  overrides: Partial<Parameters<typeof createInviteToken>[0]> = {},
  now?: number,
) {
  return createInviteToken(
    { workspaceId, workspaceName: "Acme Records", email: "newhire@acme.com", role: "ANALYST", ...overrides },
    SECRET,
    now,
  );
}

describe("acceptInvite", () => {
  test("creates an account and a membership on the invited workspace/role, never a new workspace", async () => {
    const { deps, membershipRepository, workspaceId } = await makeDeps();

    const result = await acceptInvite(
      { token: makeToken(workspaceId), password: "correct horse", name: "New Hire" },
      deps,
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.user.email, "newhire@acme.com");
    assert.equal(result.workspaceId, workspaceId);
    assert.equal(result.workspaceName, "Acme Records");
    assert.equal(result.role, "ANALYST");

    const storedUser = await deps.userRepository.findByEmail("newhire@acme.com");
    assert.ok(storedUser);
    assert.notEqual(storedUser!.passwordHash, "correct horse", "password is hashed, never stored in plaintext");
    assert.equal(await verifyPassword("correct horse", storedUser!.passwordHash), true);

    const membership = await membershipRepository.findForUserAndWorkspace(result.user.id, workspaceId);
    assert.equal(membership?.role, "ANALYST");
    assert.equal((await membershipRepository.findForUser(result.user.id)).length, 1, "exactly one membership");
  });

  test("defaults name to null when none is given", async () => {
    const { deps, workspaceId } = await makeDeps();
    const result = await acceptInvite(
      { token: makeToken(workspaceId, { email: "noname@acme.com" }), password: "correct horse", name: null },
      deps,
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.user.name, null);
  });

  test("rejects a garbage token", async () => {
    const { deps } = await makeDeps();
    const result = await acceptInvite({ token: "not-a-real-token", password: "correct horse", name: null }, deps);
    assert.deepEqual(result, { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  });

  test("rejects a token signed with a different secret", async () => {
    const { deps, workspaceId } = await makeDeps();
    const token = createInviteToken(
      { workspaceId, workspaceName: "Acme", email: "a@b.com", role: "VIEWER" },
      "a-different-secret",
    );
    const result = await acceptInvite({ token, password: "correct horse", name: null }, deps);
    assert.deepEqual(result, { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  });

  test("rejects an expired token", async () => {
    const { deps, workspaceId } = await makeDeps();
    // acceptInvite has no `now` param of its own, so expiry is simulated by
    // minting a token whose 7-day window closed a day ago.
    const expired = makeToken(workspaceId, {}, Date.now() - 8 * 24 * 60 * 60 * 1000);
    const result = await acceptInvite({ token: expired, password: "correct horse", name: null }, deps);
    assert.deepEqual(result, { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  });

  test("rejects a genuinely signed token whose role is never invitable (OWNER), creating nothing", async () => {
    const { deps, workspaceId } = await makeDeps();
    const result = await acceptInvite(
      { token: makeToken(workspaceId, { role: "OWNER" }), password: "correct horse", name: null },
      deps,
    );
    assert.deepEqual(result, { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
    assert.equal(await deps.userRepository.findByEmail("newhire@acme.com"), null);
  });

  test("rejects a password shorter than 8 characters", async () => {
    const { deps, workspaceId } = await makeDeps();
    const result = await acceptInvite({ token: makeToken(workspaceId), password: "short", name: null }, deps);
    assert.deepEqual(result, { ok: false, error: "WEAK_PASSWORD" });
  });

  test("rejects re-accepting an invite whose email already has an account", async () => {
    const { deps, workspaceId } = await makeDeps();
    const token = makeToken(workspaceId);

    const first = await acceptInvite({ token, password: "correct horse", name: null }, deps);
    assert.equal(first.ok, true);

    const second = await acceptInvite({ token, password: "another password", name: null }, deps);
    assert.deepEqual(second, { ok: false, error: "EMAIL_ALREADY_REGISTERED" });
  });

  test("rejects an invite whose email was registered independently before acceptance", async () => {
    const { deps, workspaceId } = await makeDeps();
    await deps.userRepository.create({ email: "newhire@acme.com", passwordHash: "hash", name: null });

    const result = await acceptInvite({ token: makeToken(workspaceId), password: "correct horse", name: null }, deps);
    assert.deepEqual(result, { ok: false, error: "EMAIL_ALREADY_REGISTERED" });
  });

  test("an invite to a workspace that no longer exists fails without leaving a user behind", async () => {
    const { deps } = await makeDeps();
    await assert.rejects(() =>
      acceptInvite({ token: makeToken("workspace-gone"), password: "correct horse", name: null }, deps),
    );
    assert.equal(await deps.userRepository.findByEmail("newhire@acme.com"), null);
  });
});
