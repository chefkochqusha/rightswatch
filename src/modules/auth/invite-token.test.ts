import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createInviteToken, verifyInviteToken } from "./invite-token";
import { createSessionToken } from "./session";

const SECRET = "test-secret-do-not-use-in-real-env";
const BASE_PAYLOAD = {
  workspaceId: "workspace-1",
  workspaceName: "Acme Records",
  email: "newhire@acme.com",
  role: "ANALYST" as const,
};

describe("invite tokens", () => {
  test("a freshly created token verifies and round-trips the payload", () => {
    const token = createInviteToken(BASE_PAYLOAD, SECRET);
    const payload = verifyInviteToken(token, SECRET);
    assert.ok(payload);
    assert.equal(payload?.workspaceId, "workspace-1");
    assert.equal(payload?.workspaceName, "Acme Records");
    assert.equal(payload?.email, "newhire@acme.com");
    assert.equal(payload?.role, "ANALYST");
  });

  test("sets expiresAt 7 days out from the given `now`", () => {
    const now = 1_000_000;
    const token = createInviteToken(BASE_PAYLOAD, SECRET, now);
    const payload = verifyInviteToken(token, SECRET, now);
    assert.equal(payload?.expiresAt, now + 7 * 24 * 60 * 60 * 1000);
  });

  test("a token is valid right up to its expiry instant and not after", () => {
    const now = 1_000_000;
    const token = createInviteToken(BASE_PAYLOAD, SECRET, now);
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    assert.ok(verifyInviteToken(token, SECRET, expiresAt));
    assert.equal(verifyInviteToken(token, SECRET, expiresAt + 1), null);
  });

  test("a token signed with a different secret is rejected", () => {
    const token = createInviteToken(BASE_PAYLOAD, SECRET);
    assert.equal(verifyInviteToken(token, "a-different-secret"), null);
  });

  test("a tampered payload is rejected even if well-formed", () => {
    const token = createInviteToken(BASE_PAYLOAD, SECRET);
    const [, signature] = token.split(".");
    const tamperedBody = Buffer.from(
      JSON.stringify({ ...BASE_PAYLOAD, role: "ADMIN", expiresAt: Date.now() + 60_000 }),
    ).toString("base64url");
    assert.equal(verifyInviteToken(`${tamperedBody}.${signature}`, SECRET), null);
  });

  test("garbage input is rejected rather than throwing", () => {
    assert.equal(verifyInviteToken("not-a-token", SECRET), null);
    assert.equal(verifyInviteToken("", SECRET), null);
    assert.equal(verifyInviteToken("a.b.c", SECRET), null);
  });

  test("a genuinely signed token for a role that's never invitable (OWNER) is rejected on read", () => {
    const token = createInviteToken({ ...BASE_PAYLOAD, role: "OWNER" }, SECRET);
    assert.equal(verifyInviteToken(token, SECRET), null);
  });

  test("a session cookie is never accepted as an invite link", () => {
    const session = createSessionToken(
      { userId: "user-1", sessionId: "s1", expiresAt: Date.now() + 60_000 },
      SECRET,
    );
    assert.equal(verifyInviteToken(session, SECRET), null);
  });
});
