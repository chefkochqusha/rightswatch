import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { acceptInvite } from "./accept-invite";
import { createInviteToken, INVITE_TOKEN_TTL_MS } from "./invite-token";
import { inviteTeammate, revokeInvite } from "./invite-teammate";
import { verifyPassword } from "./password";
import {
  InMemoryUserRepository,
  InMemoryWorkspaceRepository,
  InMemoryMembershipRepository,
  InMemoryAccountRepository,
  InMemoryInviteRepository,
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
      inviteRepository: new InMemoryInviteRepository(),
      secret: SECRET,
    },
    membershipRepository,
    workspaceId: workspace.id,
  };
}

type Deps = Awaited<ReturnType<typeof makeDeps>>["deps"];

/** Stores an invite row the way `inviteTeammate` does and signs a link for it. */
async function makeToken(
  deps: Deps,
  workspaceId: string,
  overrides: Partial<{ email: string; role: Parameters<typeof createInviteToken>[0]["role"] }> = {},
  now: number = Date.now(),
) {
  const email = overrides.email ?? "newhire@acme.com";
  const role = overrides.role ?? "ANALYST";
  const invite = await deps.inviteRepository.create({ workspaceId, email, role, invitedById: null, expiresAt: new Date(now + INVITE_TOKEN_TTL_MS) });
  return createInviteToken({ inviteId: invite.id, workspaceId, workspaceName: "Acme Records", email, role }, SECRET, now);
}

describe("acceptInvite", () => {
  test("creates an account and a membership on the invited workspace/role, never a new workspace", async () => {
    const { deps, membershipRepository, workspaceId } = await makeDeps();

    const result = await acceptInvite(
      { token: await makeToken(deps, workspaceId), password: "correct horse", name: "New Hire" },
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
      { token: await makeToken(deps, workspaceId, { email: "noname@acme.com" }), password: "correct horse", name: null },
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
      { inviteId: "x", workspaceId, workspaceName: "Acme", email: "a@b.com", role: "VIEWER" },
      "a-different-secret",
    );
    const result = await acceptInvite({ token, password: "correct horse", name: null }, deps);
    assert.deepEqual(result, { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  });

  test("rejects an expired token", async () => {
    const { deps, workspaceId } = await makeDeps();
    // Expiry simulated by minting a token whose 7-day window closed a day ago.
    const expired = await makeToken(deps, workspaceId, {}, Date.now() - 8 * 24 * 60 * 60 * 1000);
    const result = await acceptInvite({ token: expired, password: "correct horse", name: null }, deps);
    assert.deepEqual(result, { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  });

  test("rejects a genuinely signed token whose role is never invitable (OWNER), creating nothing", async () => {
    const { deps, workspaceId } = await makeDeps();
    const result = await acceptInvite(
      { token: await makeToken(deps, workspaceId, { role: "OWNER" }), password: "correct horse", name: null },
      deps,
    );
    assert.deepEqual(result, { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
    assert.equal(await deps.userRepository.findByEmail("newhire@acme.com"), null);
  });

  test("rejects a password shorter than 8 characters", async () => {
    const { deps, workspaceId } = await makeDeps();
    const result = await acceptInvite({ token: await makeToken(deps, workspaceId), password: "short", name: null }, deps);
    assert.deepEqual(result, { ok: false, error: "WEAK_PASSWORD" });
  });

  test("an invite works once: accepting it again is refused", async () => {
    const { deps, workspaceId } = await makeDeps();
    const token = await makeToken(deps, workspaceId);

    const first = await acceptInvite({ token, password: "correct horse", name: null }, deps);
    assert.equal(first.ok, true);

    const second = await acceptInvite({ token, password: "another password", name: null }, deps);
    assert.deepEqual(second, { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  });

  test("rejects an invite whose email was registered independently before acceptance", async () => {
    const { deps, workspaceId } = await makeDeps();
    await deps.userRepository.create({ email: "newhire@acme.com", passwordHash: "hash", name: null });

    const result = await acceptInvite({ token: await makeToken(deps, workspaceId), password: "correct horse", name: null }, deps);
    assert.deepEqual(result, { ok: false, error: "EMAIL_ALREADY_REGISTERED" });
  });

  test("an invite to a workspace that no longer exists fails without leaving a user behind", async () => {
    const { deps } = await makeDeps();
    const token = await makeToken(deps, "workspace-gone");
    await assert.rejects(() => acceptInvite({ token, password: "correct horse", name: null }, deps));
    assert.equal(await deps.userRepository.findByEmail("newhire@acme.com"), null);
  });

  test("a taken-back invite no longer works, and creates nothing", async () => {
    const { deps, workspaceId } = await makeDeps();
    const issued = await inviteTeammate(
      { workspaceId, workspaceName: "Acme Records", email: "newhire@acme.com", role: "ANALYST", invitedById: null },
      { secret: SECRET, inviteRepository: deps.inviteRepository },
    );
    assert.ok(issued.ok);
    if (!issued.ok) return;
    await revokeInvite({ workspaceId, inviteId: issued.inviteId }, { inviteRepository: deps.inviteRepository });
    const result = await acceptInvite({ token: issued.token, password: "correct horse", name: null }, deps);
    assert.deepEqual(result, { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
    assert.equal(await deps.userRepository.findByEmail("newhire@acme.com"), null);
  });

  test("a signed link whose invite row is missing or belongs elsewhere is refused", async () => {
    const { deps, workspaceId } = await makeDeps();
    const unknown = createInviteToken({ inviteId: "no-such-invite", workspaceId, workspaceName: "Acme", email: "newhire@acme.com", role: "ANALYST" }, SECRET);
    assert.deepEqual(await acceptInvite({ token: unknown, password: "correct horse", name: null }, deps), { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });

    const other = await deps.inviteRepository.create({ workspaceId: "other-workspace", email: "newhire@acme.com", role: "ANALYST", invitedById: null, expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS) });
    const mixed = createInviteToken({ inviteId: other.id, workspaceId, workspaceName: "Acme", email: "newhire@acme.com", role: "ANALYST" }, SECRET);
    assert.deepEqual(await acceptInvite({ token: mixed, password: "correct horse", name: null }, deps), { ok: false, error: "INVALID_OR_EXPIRED_TOKEN" });
  });

  test("accepting marks the invite as used, so it leaves the open list", async () => {
    const { deps, workspaceId } = await makeDeps();
    const token = await makeToken(deps, workspaceId);
    assert.equal((await deps.inviteRepository.findPending(workspaceId, new Date())).length, 1);
    assert.equal((await acceptInvite({ token, password: "correct horse", name: null }, deps)).ok, true);
    assert.equal((await deps.inviteRepository.findPending(workspaceId, new Date())).length, 0);
  });
});
