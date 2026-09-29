import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryUserRepository,
  InMemoryWorkspaceRepository,
  InMemoryMembershipRepository,
} from "./in-memory-repositories";

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
