import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryUserRepository,
  InMemoryWorkspaceRepository,
  InMemoryMembershipRepository,
  InMemoryAccountRepository,
  InMemorySessionRepository,
} from "./in-memory-repositories";
import { UniqueConstraintError } from "./errors";

function makeAccountRepo() {
  const users = new InMemoryUserRepository();
  const workspaces = new InMemoryWorkspaceRepository();
  const memberships = new InMemoryMembershipRepository();
  return { users, workspaces, memberships, accounts: new InMemoryAccountRepository(users, workspaces, memberships) };
}

const NEW_USER = { email: "jane@acme.com", passwordHash: "hash", name: null };

describe("InMemoryAccountRepository", () => {
  test("creates the user, a new workspace and the membership together", async () => {
    const { accounts, memberships } = makeAccountRepo();
    const { user, workspace, membership } = await accounts.createAccount({
      user: NEW_USER,
      role: "OWNER",
      workspace: { newName: "Acme", newSlug: "acme" },
    });
    assert.equal(workspace.slug, "acme");
    assert.equal(membership.userId, user.id);
    assert.equal(membership.workspaceId, workspace.id);
    assert.equal((await memberships.findForUser(user.id))[0]?.role, "OWNER");
  });

  test("joins an existing workspace without creating one", async () => {
    const { accounts, workspaces } = makeAccountRepo();
    const existing = await workspaces.create({ name: "Acme", slug: "acme" });
    const { workspace, membership } = await accounts.createAccount({
      user: NEW_USER,
      role: "VIEWER",
      workspace: { existingId: existing.id },
    });
    assert.equal(workspace.id, existing.id);
    assert.equal(membership.role, "VIEWER");
  });

  test("a duplicate email throws UniqueConstraintError and writes nothing", async () => {
    const { accounts, users, workspaces } = makeAccountRepo();
    await users.create(NEW_USER);
    await assert.rejects(
      () => accounts.createAccount({ user: NEW_USER, role: "OWNER", workspace: { newName: "Acme", newSlug: "acme" } }),
      (error: unknown) => error instanceof UniqueConstraintError && error.field === "email",
    );
    assert.equal(await workspaces.findBySlug("acme"), null);
  });

  test("a taken slug throws UniqueConstraintError and creates no user", async () => {
    const { accounts, users, workspaces } = makeAccountRepo();
    await workspaces.create({ name: "Acme", slug: "acme" });
    await assert.rejects(
      () => accounts.createAccount({ user: NEW_USER, role: "OWNER", workspace: { newName: "Acme", newSlug: "acme" } }),
      (error: unknown) => error instanceof UniqueConstraintError && error.field === "slug",
    );
    assert.equal(await users.findByEmail("jane@acme.com"), null);
  });

  test("joining a workspace that doesn't exist throws and creates no user", async () => {
    const { accounts, users } = makeAccountRepo();
    await assert.rejects(() =>
      accounts.createAccount({ user: NEW_USER, role: "VIEWER", workspace: { existingId: "nope" } }),
    );
    assert.equal(await users.findByEmail("jane@acme.com"), null);
  });
});

describe("InMemorySessionRepository", () => {
  test("creates, finds and deletes a session; deleting twice is fine", async () => {
    const repo = new InMemorySessionRepository();
    await repo.create({ id: "h1", userId: "user-1", expiresAt: new Date(10_000) });
    assert.equal((await repo.findById("h1"))?.userId, "user-1");

    await repo.delete("h1");
    await repo.delete("h1");
    assert.equal(await repo.findById("h1"), null);
  });

  test("deleteExpiredForUser removes only that user's expired rows", async () => {
    const repo = new InMemorySessionRepository();
    await repo.create({ id: "expired", userId: "user-1", expiresAt: new Date(1_000) });
    await repo.create({ id: "live", userId: "user-1", expiresAt: new Date(5_000) });
    await repo.create({ id: "other", userId: "user-2", expiresAt: new Date(1_000) });

    await repo.deleteExpiredForUser("user-1", new Date(2_000));

    assert.equal(await repo.findById("expired"), null);
    assert.ok(await repo.findById("live"));
    assert.ok(await repo.findById("other"));
  });
});

describe("InMemoryUserRepository", () => {
  test("creates a user and finds it by id and by email", async () => {
    const repo = new InMemoryUserRepository();
    const user = await repo.create({
      email: "Jane@Example.com",
      passwordHash: "hash",
      name: "Jane",
    });

    assert.equal(user.email, "jane@example.com", "email is normalized to lowercase");
    assert.equal((await repo.findById(user.id))?.id, user.id);
    assert.equal((await repo.findByEmail("jane@example.com"))?.id, user.id);
    assert.equal((await repo.findByEmail("JANE@EXAMPLE.COM"))?.id, user.id, "lookup is case-insensitive");
  });

  test("returns null for an unknown id or email", async () => {
    const repo = new InMemoryUserRepository();
    assert.equal(await repo.findById("nope"), null);
    assert.equal(await repo.findByEmail("nobody@example.com"), null);
  });

  test("updatePasswordHash replaces the stored hash", async () => {
    const repo = new InMemoryUserRepository();
    const user = await repo.create({ email: "a@b.com", passwordHash: "old", name: null });
    await repo.updatePasswordHash(user.id, "new");
    assert.equal((await repo.findById(user.id))?.passwordHash, "new");
  });
});

describe("InMemoryWorkspaceRepository", () => {
  test("creates a workspace and finds it by id and by slug", async () => {
    const repo = new InMemoryWorkspaceRepository();
    const workspace = await repo.create({ name: "Acme Records", slug: "acme-records" });

    assert.equal((await repo.findById(workspace.id))?.slug, "acme-records");
    assert.equal((await repo.findBySlug("acme-records"))?.id, workspace.id);
    assert.equal(await repo.findBySlug("nope"), null);
  });
});

describe("InMemoryMembershipRepository", () => {
  test("creates a membership and finds it for a user, and for a user+workspace pair", async () => {
    const repo = new InMemoryMembershipRepository();
    const membership = await repo.create({
      userId: "user-1",
      workspaceId: "workspace-1",
      role: "OWNER",
    });

    const forUser = await repo.findForUser("user-1");
    assert.equal(forUser.length, 1);
    assert.equal(forUser[0].id, membership.id);

    assert.equal(
      (await repo.findForUserAndWorkspace("user-1", "workspace-1"))?.role,
      "OWNER",
    );
    assert.equal(await repo.findForUserAndWorkspace("user-1", "some-other-workspace"), null);
  });

  test("a user can hold memberships in more than one workspace", async () => {
    const repo = new InMemoryMembershipRepository();
    await repo.create({ userId: "user-1", workspaceId: "workspace-1", role: "OWNER" });
    await repo.create({ userId: "user-1", workspaceId: "workspace-2", role: "VIEWER" });

    const forUser = await repo.findForUser("user-1");
    assert.equal(forUser.length, 2);
  });

  test("findForWorkspace returns every membership on that workspace, and none from another", async () => {
    const repo = new InMemoryMembershipRepository();
    await repo.create({ userId: "user-1", workspaceId: "workspace-1", role: "OWNER" });
    await repo.create({ userId: "user-2", workspaceId: "workspace-1", role: "ANALYST" });
    await repo.create({ userId: "user-3", workspaceId: "workspace-2", role: "OWNER" });

    const forWorkspace1 = await repo.findForWorkspace("workspace-1");
    assert.equal(forWorkspace1.length, 2);
    assert.deepEqual(
      forWorkspace1.map((m) => m.userId).sort(),
      ["user-1", "user-2"],
    );

    assert.equal(await repo.findForWorkspace("workspace-nonexistent").then((r) => r.length), 0);
  });
});
