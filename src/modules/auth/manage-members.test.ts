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
import { changeMemberRole, removeMember, transferOwnership } from "./manage-members";

async function setup() {
  const userRepository = new InMemoryUserRepository();
  const workspaceRepository = new InMemoryWorkspaceRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  const sessionRepository = new InMemorySessionRepository();
  const accountRepository = new InMemoryAccountRepository(userRepository, workspaceRepository, membershipRepository);
  const passwordHash = await hashPassword("owner-password-1");
  const owner = await accountRepository.createAccount({ user: { email: "nina@northstar.test", passwordHash, name: "Nina" }, role: "OWNER", workspace: { newName: "Northstar", newSlug: "northstar" } });
  const ws = owner.workspace.id;
  const join = (email: string, role: "ADMIN" | "ANALYST" | "VIEWER") =>
    accountRepository.createAccount({ user: { email, passwordHash, name: email }, role, workspace: { existingId: ws } });
  const admin = await join("ada@northstar.test", "ADMIN");
  const analyst = await join("ben@northstar.test", "ANALYST");
  const viewer = await join("vic@northstar.test", "VIEWER");
  const deps = { membershipRepository, accountRepository, sessionRepository, userRepository };
  const role = async (userId: string) => (await membershipRepository.findForUserAndWorkspace(userId, ws))?.role ?? null;
  return { deps, ws, owner, admin, analyst, viewer, role, userRepository, sessionRepository, membershipRepository };
}

describe("changeMemberRole", () => {
  test("owners and admins change other members' roles", async () => {
    const { deps, ws, owner, admin, analyst, viewer, role } = await setup();
    assert.deepEqual(await changeMemberRole({ actorId: owner.user.id, workspaceId: ws, targetUserId: analyst.user.id, role: "ADMIN" }, deps), { ok: true, previousRole: "ANALYST" });
    assert.equal(await role(analyst.user.id), "ADMIN");
    assert.deepEqual(await changeMemberRole({ actorId: admin.user.id, workspaceId: ws, targetUserId: viewer.user.id, role: "ANALYST" }, deps), { ok: true, previousRole: "VIEWER" });
    assert.equal(await role(viewer.user.id), "ANALYST");
  });

  test("nobody makes an owner, touches the owner, changes themselves, or acts without the right role", async () => {
    const { deps, ws, owner, admin, analyst, viewer, role } = await setup();
    const change = (actorId: string, targetUserId: string, r: string) => changeMemberRole({ actorId, workspaceId: ws, targetUserId, role: r }, deps);
    assert.deepEqual(await change(owner.user.id, admin.user.id, "OWNER"), { ok: false, error: "INVALID_ROLE" });
    assert.deepEqual(await change(admin.user.id, owner.user.id, "VIEWER"), { ok: false, error: "OWNER" });
    assert.deepEqual(await change(admin.user.id, admin.user.id, "VIEWER"), { ok: false, error: "SELF" });
    assert.deepEqual(await change(analyst.user.id, viewer.user.id, "ADMIN"), { ok: false, error: "FORBIDDEN" });
    assert.deepEqual(await change(owner.user.id, "someone-else", "ADMIN"), { ok: false, error: "NOT_A_MEMBER" });
    assert.equal(await role(owner.user.id), "OWNER");
    assert.equal(await role(admin.user.id), "ADMIN");
  });

  test("a member of another workspace is out of reach", async () => {
    const { deps, ws, admin } = await setup();
    const other = await deps.accountRepository.createAccount({ user: { email: "x@other.test", passwordHash: "h", name: null }, role: "OWNER", workspace: { newName: "Other", newSlug: "other" } });
    assert.deepEqual(await changeMemberRole({ actorId: admin.user.id, workspaceId: ws, targetUserId: other.user.id, role: "VIEWER" }, deps), { ok: false, error: "NOT_A_MEMBER" });
    assert.deepEqual(await changeMemberRole({ actorId: other.user.id, workspaceId: ws, targetUserId: admin.user.id, role: "VIEWER" }, deps), { ok: false, error: "FORBIDDEN" });
  });
});

describe("removeMember", () => {
  test("removing someone erases their account and ends their sessions", async () => {
    const { deps, ws, admin, analyst, userRepository, sessionRepository, role } = await setup();
    await sessionRepository.create({ id: "s1", userId: analyst.user.id, expiresAt: new Date(Date.now() + 60_000) });
    assert.deepEqual(await removeMember({ actorId: admin.user.id, workspaceId: ws, targetUserId: analyst.user.id }, deps), { ok: true, previousRole: "ANALYST" });
    assert.equal(await userRepository.findById(analyst.user.id), null);
    assert.equal(await role(analyst.user.id), null);
  });

  test("the owner and oneself can't be removed; analysts can't remove anyone", async () => {
    const { deps, ws, owner, admin, analyst, viewer, userRepository } = await setup();
    assert.deepEqual(await removeMember({ actorId: admin.user.id, workspaceId: ws, targetUserId: owner.user.id }, deps), { ok: false, error: "OWNER" });
    assert.deepEqual(await removeMember({ actorId: admin.user.id, workspaceId: ws, targetUserId: admin.user.id }, deps), { ok: false, error: "SELF" });
    assert.deepEqual(await removeMember({ actorId: analyst.user.id, workspaceId: ws, targetUserId: viewer.user.id }, deps), { ok: false, error: "FORBIDDEN" });
    assert.ok(await userRepository.findById(viewer.user.id));
  });

  test("someone who also belongs elsewhere keeps their account and loses only this membership", async () => {
    const { deps, ws, owner, analyst, userRepository, sessionRepository, membershipRepository } = await setup();
    const other = await deps.accountRepository.createAccount({ user: { email: "o@other.test", passwordHash: "h", name: null }, role: "OWNER", workspace: { newName: "Other", newSlug: "other" } });
    await membershipRepository.create({ userId: analyst.user.id, workspaceId: other.workspace.id, role: "VIEWER" });
    await sessionRepository.create({ id: "s2", userId: analyst.user.id, expiresAt: new Date(Date.now() + 60_000) });
    await removeMember({ actorId: owner.user.id, workspaceId: ws, targetUserId: analyst.user.id }, deps);
    assert.ok(await userRepository.findById(analyst.user.id));
    assert.equal(await membershipRepository.findForUserAndWorkspace(analyst.user.id, ws), null);
    assert.ok(await membershipRepository.findForUserAndWorkspace(analyst.user.id, other.workspace.id));
    assert.equal(await sessionRepository.findById("s2"), null, "logged out");
  });
});

describe("transferOwnership", () => {
  test("the owner hands the workspace to an admin with their password and stays as admin", async () => {
    const { deps, ws, owner, admin, role } = await setup();
    assert.deepEqual(await transferOwnership({ ownerId: owner.user.id, workspaceId: ws, targetUserId: admin.user.id, password: "owner-password-1" }, deps), { ok: true });
    assert.equal(await role(admin.user.id), "OWNER");
    assert.equal(await role(owner.user.id), "ADMIN");
  });

  test("only to an admin, only by the owner, never without the password", async () => {
    const { deps, ws, owner, admin, analyst, role } = await setup();
    const t = (ownerId: string, targetUserId: string, password = "owner-password-1") => transferOwnership({ ownerId, workspaceId: ws, targetUserId, password }, deps);
    assert.deepEqual(await t(owner.user.id, analyst.user.id), { ok: false, error: "NOT_AN_ADMIN" });
    assert.deepEqual(await t(admin.user.id, analyst.user.id), { ok: false, error: "FORBIDDEN" });
    assert.deepEqual(await t(owner.user.id, owner.user.id), { ok: false, error: "SELF" });
    assert.deepEqual(await t(owner.user.id, admin.user.id, "wrong"), { ok: false, error: "WRONG_PASSWORD" });
    assert.equal(await role(owner.user.id), "OWNER");
    assert.equal(await role(admin.user.id), "ADMIN");
  });

  test("password guesses are rate-limited", async () => {
    const { deps, ws, owner, admin } = await setup();
    const rateLimiter = new InMemoryRateLimiter({ maxAttempts: 2, windowMs: 60_000, blockMs: 60_000 });
    const d = { ...deps, rateLimiter };
    const t = (password: string) => transferOwnership({ ownerId: owner.user.id, workspaceId: ws, targetUserId: admin.user.id, password }, d);
    await t("a");
    await t("b");
    assert.deepEqual(await t("owner-password-1"), { ok: false, error: "RATE_LIMITED" });
  });
});
