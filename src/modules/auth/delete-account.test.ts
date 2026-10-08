import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryAccountRepository, InMemoryMembershipRepository, InMemoryUserRepository, InMemoryWorkspaceRepository } from "./in-memory-repositories";
import { InMemoryRateLimiter } from "./rate-limiter";
import { hashPassword } from "./password";
import { deleteOwnAccount } from "./delete-account";

async function setup() {
  const userRepository = new InMemoryUserRepository();
  const workspaceRepository = new InMemoryWorkspaceRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const accountRepository = new InMemoryAccountRepository(userRepository, workspaceRepository, membershipRepository);
  const passwordHash = await hashPassword("member-password-1");
  const owner = await accountRepository.createAccount({
    user: { email: "nina@northstar.test", passwordHash, name: "Nina" },
    role: "OWNER",
    workspace: { newName: "Northstar Music", newSlug: "northstar" },
  });
  const analyst = await accountRepository.createAccount({
    user: { email: "ben@northstar.test", passwordHash, name: "Ben" },
    role: "ANALYST",
    workspace: { existingId: owner.workspace.id },
  });
  return { deps: { userRepository, membershipRepository, accountRepository }, owner, analyst, userRepository, membershipRepository, workspaceRepository };
}

describe("deleteOwnAccount", () => {
  test("a member deletes their account and membership; the workspace and the owner stay", async () => {
    const { deps, owner, analyst, userRepository, membershipRepository, workspaceRepository } = await setup();
    let logged = false;
    const result = await deleteOwnAccount({ userId: analyst.user.id, password: "member-password-1" }, { ...deps, beforeDelete: async () => { logged = true; } });
    assert.deepEqual(result, { ok: true });
    assert.equal(logged, true);
    assert.equal(await userRepository.findById(analyst.user.id), null);
    assert.deepEqual(await membershipRepository.findForUser(analyst.user.id), []);
    assert.ok(await userRepository.findById(owner.user.id));
    assert.ok(await workspaceRepository.findById(owner.workspace.id));
  });

  test("an owner can't delete only their account", async () => {
    const { deps, owner, userRepository } = await setup();
    assert.deepEqual(await deleteOwnAccount({ userId: owner.user.id, password: "member-password-1" }, deps), { ok: false, error: "OWNER" });
    assert.ok(await userRepository.findById(owner.user.id));
  });

  test("a wrong password deletes nothing, and repeated guesses are rate-limited", async () => {
    const { deps, analyst, userRepository } = await setup();
    const rateLimiter = new InMemoryRateLimiter({ maxAttempts: 2, windowMs: 60_000, blockMs: 60_000 });
    let logged = false;
    const d = { ...deps, rateLimiter, beforeDelete: async () => { logged = true; } };
    assert.deepEqual(await deleteOwnAccount({ userId: analyst.user.id, password: "nope" }, d), { ok: false, error: "WRONG_PASSWORD" });
    assert.deepEqual(await deleteOwnAccount({ userId: analyst.user.id, password: "nope" }, d), { ok: false, error: "WRONG_PASSWORD" });
    assert.deepEqual(await deleteOwnAccount({ userId: analyst.user.id, password: "member-password-1" }, d), { ok: false, error: "RATE_LIMITED" });
    assert.equal(logged, false);
    assert.ok(await userRepository.findById(analyst.user.id));
  });
});
