import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryAccountRepository,
  InMemoryMembershipRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  InMemoryWorkspaceRepository,
} from "./in-memory-repositories";
import { InMemoryRateLimiter } from "./rate-limiter";
import { hashPassword } from "./password";
import { deleteWorkspace } from "./delete-workspace";

async function setup() {
  const userRepository = new InMemoryUserRepository();
  const workspaceRepository = new InMemoryWorkspaceRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const accountRepository = new InMemoryAccountRepository(userRepository, workspaceRepository, membershipRepository);
  const passwordHash = await hashPassword("owner-password-1");
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
  const deps = { userRepository, workspaceRepository, membershipRepository, accountRepository };
  const input = { workspaceId: owner.workspace.id, actorUserId: owner.user.id, password: "owner-password-1", confirmName: "Northstar Music" };
  return { ...deps, deps, input, owner, analyst, sessions: new InMemorySessionRepository() };
}

describe("deleteWorkspace", () => {
  test("deletes the workspace, its memberships and every account that only belonged to it", async () => {
    const { deps, input, owner, analyst, userRepository, workspaceRepository, membershipRepository } = await setup();
    assert.deepEqual(await deleteWorkspace(input, deps), { ok: true });
    assert.equal(await workspaceRepository.findById(owner.workspace.id), null);
    assert.equal(await userRepository.findById(owner.user.id), null);
    assert.equal(await userRepository.findById(analyst.user.id), null);
    assert.deepEqual(await membershipRepository.findForWorkspace(owner.workspace.id), []);
  });

  test("keeps an account that belongs to another workspace as well", async () => {
    const { deps, input, analyst, accountRepository, userRepository } = await setup();
    const other = await accountRepository.createAccount({
      user: { email: "other@else.test", passwordHash: "x", name: "Other" },
      role: "OWNER",
      workspace: { newName: "Else", newSlug: "else" },
    });
    // Ben joins the second workspace too.
    await deps.membershipRepository.create({ userId: analyst.user.id, workspaceId: other.workspace.id, role: "VIEWER" });
    await deleteWorkspace(input, deps);
    assert.ok(await userRepository.findById(analyst.user.id));
    assert.ok(await deps.workspaceRepository.findById(other.workspace.id));
  });

  test("only the owner can: an analyst is refused and nothing is deleted", async () => {
    const { deps, input, analyst, owner } = await setup();
    const result = await deleteWorkspace({ ...input, actorUserId: analyst.user.id }, deps);
    assert.deepEqual(result, { ok: false, error: "NOT_OWNER" });
    assert.ok(await deps.workspaceRepository.findById(owner.workspace.id));
  });

  test("a wrong password deletes nothing and counts against the limit", async () => {
    const { deps, input, owner } = await setup();
    const rateLimiter = new InMemoryRateLimiter({ maxAttempts: 2, windowMs: 60_000, blockMs: 60_000 });
    const withLimit = { ...deps, rateLimiter };
    assert.deepEqual(await deleteWorkspace({ ...input, password: "nope" }, withLimit), { ok: false, error: "WRONG_PASSWORD" });
    assert.deepEqual(await deleteWorkspace({ ...input, password: "nope" }, withLimit), { ok: false, error: "WRONG_PASSWORD" });
    // Blocked now: even the right password is refused.
    assert.deepEqual(await deleteWorkspace(input, withLimit), { ok: false, error: "RATE_LIMITED" });
    assert.ok(await deps.workspaceRepository.findById(owner.workspace.id));
  });

  test("the workspace name has to be typed out exactly (surrounding spaces don't count)", async () => {
    const { deps, input, owner } = await setup();
    assert.deepEqual(await deleteWorkspace({ ...input, confirmName: "northstar music" }, deps), { ok: false, error: "NAME_MISMATCH" });
    assert.ok(await deps.workspaceRepository.findById(owner.workspace.id));
    assert.deepEqual(await deleteWorkspace({ ...input, confirmName: "  Northstar Music " }, deps), { ok: true });
  });

  test("beforeDelete runs after the checks and before the deletion; if it throws, nothing is deleted", async () => {
    const { deps, input, owner } = await setup();
    const order: string[] = [];
    await assert.rejects(
      () => deleteWorkspace(input, { ...deps, beforeDelete: async () => { order.push("cancel"); throw new Error("stripe is down"); } }),
      /stripe is down/,
    );
    assert.deepEqual(order, ["cancel"]);
    assert.ok(await deps.workspaceRepository.findById(owner.workspace.id));

    // A refused request never reaches the hook.
    await deleteWorkspace({ ...input, password: "wrong" }, { ...deps, beforeDelete: async () => { order.push("should not run"); } });
    assert.deepEqual(order, ["cancel"]);
  });

  test("an unknown workspace is reported, not thrown", async () => {
    const { deps, input } = await setup();
    assert.deepEqual(await deleteWorkspace({ ...input, workspaceId: "nope" }, deps), { ok: false, error: "NO_SUCH_WORKSPACE" });
  });
});
