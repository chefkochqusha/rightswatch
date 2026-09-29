import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { inviteTeammate } from "./invite-teammate";
import { verifyInviteToken } from "./invite-token";
import { InMemoryUserRepository } from "./in-memory-repositories";

const SECRET = "test-secret-do-not-use-in-real-env";

function makeDeps() {
  return { userRepository: new InMemoryUserRepository(), secret: SECRET };
}

describe("inviteTeammate", () => {
  test("issues a signed token carrying the workspace, email, and role", async () => {
    const result = await inviteTeammate(
      { workspaceId: "workspace-1", workspaceName: "Acme Records", email: "newhire@acme.com", role: "ANALYST" },
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
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "NewHire@Acme.com", role: "VIEWER" },
      makeDeps(),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(verifyInviteToken(result.token, SECRET)?.email, "newhire@acme.com");
  });

  test("accepts every invitable role", async () => {
    for (const role of ["ADMIN", "ANALYST", "VIEWER"] as const) {
      const result = await inviteTeammate(
        { workspaceId: "workspace-1", workspaceName: "Acme", email: `${role.toLowerCase()}@acme.com`, role },
        makeDeps(),
      );
      assert.equal(result.ok, true, `role ${role} should be invitable`);
    }
  });

  test("rejects OWNER as an invited role — a workspace has exactly one, set at signup", async () => {
    const result = await inviteTeammate(
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "newhire@acme.com", role: "OWNER" },
      makeDeps(),
    );
    assert.deepEqual(result, { ok: false, error: "INVALID_ROLE" });
  });

  test("rejects an invalid email without issuing a token", async () => {
    const result = await inviteTeammate(
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "not-an-email", role: "VIEWER" },
      makeDeps(),
    );
    assert.deepEqual(result, { ok: false, error: "INVALID_EMAIL" });
  });

  test("rejects inviting an email that already has a RightsWatch account", async () => {
    const deps = makeDeps();
    await deps.userRepository.create({ email: "existing@acme.com", passwordHash: "hash", name: null });

    const result = await inviteTeammate(
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "existing@acme.com", role: "VIEWER" },
      deps,
    );
    assert.deepEqual(result, { ok: false, error: "EMAIL_HAS_EXISTING_ACCOUNT" });
  });

  test("rejects an existing account even when the email's case differs", async () => {
    const deps = makeDeps();
    await deps.userRepository.create({ email: "existing@acme.com", passwordHash: "hash", name: null });

    const result = await inviteTeammate(
      { workspaceId: "workspace-1", workspaceName: "Acme", email: "Existing@Acme.com", role: "VIEWER" },
      deps,
    );
    assert.deepEqual(result, { ok: false, error: "EMAIL_HAS_EXISTING_ACCOUNT" });
  });
});
