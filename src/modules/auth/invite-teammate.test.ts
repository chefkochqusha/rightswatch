import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { inviteTeammate } from "./invite-teammate";
import { verifyInviteToken } from "./invite-token";
import { InMemoryInviteRepository } from "./in-memory-repositories";
import { revokeInvite } from "./invite-teammate";

const SECRET = "test-secret-do-not-use-in-real-env";

function makeDeps(inviteRepository = new InMemoryInviteRepository()) {
  return { secret: SECRET, inviteRepository };
}

describe("inviteTeammate", () => {
  test("issues a signed token carrying the workspace, email, and role", async () => {
    const result = await inviteTeammate(
      { workspaceId: "workspace-1", workspaceName: "Acme Records", email: "newhire@acme.com", role: "ANALYST", invitedById: null },
      makeDeps(),
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;

    const payload = verifyInviteToken(result.token, SECRET);
    assert.ok(payload);
    assert.equal(payload?.workspaceId, "workspace-1");
    assert.equal(payload?.workspaceName, "Acme Records");
    assert.equal(payload?.email, "newhire@acme.com");
    assert.equal(payload?.role, "ANALYST");
  });

  test("normalizes the invited email to lowercase in the token", async () => {
    const result = await inviteTeammate(
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "NewHire@Acme.com", role: "VIEWER", invitedById: null },
      makeDeps(),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(verifyInviteToken(result.token, SECRET)?.email, "newhire@acme.com");
  });

  test("accepts every invitable role", async () => {
    for (const role of ["ADMIN", "ANALYST", "VIEWER"] as const) {
      const result = await inviteTeammate(
        { workspaceId: "workspace-1", workspaceName: "Acme", email: `${role.toLowerCase()}@acme.com`, role, invitedById: null },
        makeDeps(),
      );
      assert.equal(result.ok, true, `role ${role} should be invitable`);
    }
  });

  test("rejects OWNER as an invited role — a workspace has exactly one, set at signup", async () => {
    const result = await inviteTeammate(
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "newhire@acme.com", role: "OWNER", invitedById: null },
      makeDeps(),
    );
    assert.deepEqual(result, { ok: false, error: "INVALID_ROLE" });
  });

  test("rejects an invalid email without issuing a token", async () => {
    const result = await inviteTeammate(
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "not-an-email", role: "VIEWER", invitedById: null },
      makeDeps(),
    );
    assert.deepEqual(result, { ok: false, error: "INVALID_EMAIL" });
  });

  test("never consults which emails have accounts — it has no way to, so it can't leak it", async () => {
    // The dependencies are the secret and the invite rows alone — no user
    // repository. An email that already has an account is turned away when
    // the invite is accepted (`acceptInvite`), where only the link's holder sees it.
    assert.deepEqual(Object.keys(makeDeps()), ["secret", "inviteRepository"]);
    const result = await inviteTeammate(
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "existing@acme.com", role: "VIEWER", invitedById: null },
      makeDeps(),
    );
    assert.equal(result.ok, true);
  });

  test("stores a pending invite row and puts its id in the link", async () => {
    const invites = new InMemoryInviteRepository();
    const result = await inviteTeammate(
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "sam@acme.com", role: "VIEWER", invitedById: "owner-1" },
      makeDeps(invites),
    );
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(verifyInviteToken(result.token, SECRET)?.inviteId, result.inviteId);
    const pending = await invites.findPending("workspace-1", new Date());
    assert.equal(pending.length, 1);
    assert.equal(pending[0].email, "sam@acme.com");
    assert.equal(pending[0].invitedById, "owner-1");
  });

  test("inviting the same email again takes back the earlier invite", async () => {
    const invites = new InMemoryInviteRepository();
    const input = { workspaceId: "workspace-1", workspaceName: "Acme", email: "sam@acme.com", role: "VIEWER" as const, invitedById: null };
    const first = await inviteTeammate(input, makeDeps(invites));
    const second = await inviteTeammate({ ...input, role: "ADMIN" }, makeDeps(invites));
    assert.ok(first.ok && second.ok);
    const pending = await invites.findPending("workspace-1", new Date());
    assert.deepEqual(pending.map((i) => i.role), ["ADMIN"]);
    if (first.ok) assert.ok((await invites.findById(first.inviteId))?.revokedAt);
  });

  test("revokeInvite only touches the caller's workspace", async () => {
    const invites = new InMemoryInviteRepository();
    const result = await inviteTeammate(
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "sam@acme.com", role: "VIEWER", invitedById: null },
      makeDeps(invites),
    );
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(await revokeInvite({ workspaceId: "workspace-2", inviteId: result.inviteId }, { inviteRepository: invites }), false);
    assert.equal((await invites.findPending("workspace-1", new Date())).length, 1);
    assert.equal(await revokeInvite({ workspaceId: "workspace-1", inviteId: result.inviteId }, { inviteRepository: invites }), true);
    assert.equal((await invites.findPending("workspace-1", new Date())).length, 0);
    assert.equal(await revokeInvite({ workspaceId: "workspace-1", inviteId: result.inviteId }, { inviteRepository: invites }), false);
  });

  test("old settled invites are deleted when a new one is sent", async () => {
    const invites = new InMemoryInviteRepository();
    const day = 24 * 60 * 60 * 1000;
    const start = new Date("2026-01-01T00:00:00Z");
    const old = await inviteTeammate(
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "old@acme.com", role: "VIEWER", invitedById: null },
      { ...makeDeps(invites), now: start },
    );
    assert.ok(old.ok);
    // Expired after 7 days; 30 days after that it goes.
    await inviteTeammate(
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "new@acme.com", role: "VIEWER", invitedById: null },
      { ...makeDeps(invites), now: new Date(start.getTime() + 38 * day) },
    );
    if (old.ok) assert.equal(await invites.findById(old.inviteId), null);
  });

  test("the workspace's invite rows, open and settled, can be listed for the data export", async () => {
    const invites = new InMemoryInviteRepository();
    const deps = makeDeps(invites);
    const a = await inviteTeammate({ workspaceId: "workspace-1", workspaceName: "Acme", email: "a@acme.com", role: "VIEWER", invitedById: null }, deps);
    await inviteTeammate({ workspaceId: "workspace-1", workspaceName: "Acme", email: "b@acme.com", role: "VIEWER", invitedById: null }, deps);
    await inviteTeammate({ workspaceId: "workspace-2", workspaceName: "Other", email: "c@other.com", role: "VIEWER", invitedById: null }, deps);
    assert.ok(a.ok);
    if (a.ok) await revokeInvite({ workspaceId: "workspace-1", inviteId: a.inviteId }, { inviteRepository: invites });
    const rows = await invites.findForWorkspace("workspace-1");
    assert.deepEqual(rows.map((r) => r.email).sort(), ["a@acme.com", "b@acme.com"]);
  });
});
