import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createSessionToken, verifySessionToken } from "./session";
import { createInviteToken } from "./invite-token";
import { deriveKey } from "./derive-key";

const SECRET = "test-secret-do-not-use-in-real-env";
const BASE = { userId: "user-1", sessionId: "session-abc" };

describe("session tokens", () => {
  test("a freshly created token verifies and round-trips the payload", () => {
    const token = createSessionToken({ ...BASE, expiresAt: Date.now() + 60_000 }, SECRET);
    const payload = verifySessionToken(token, SECRET);
    assert.ok(payload);
    assert.equal(payload?.userId, "user-1");
    assert.equal(payload?.sessionId, "session-abc");
  });

  test("an expired token is rejected", () => {
    const token = createSessionToken({ ...BASE, expiresAt: Date.now() - 1 }, SECRET);
    assert.equal(verifySessionToken(token, SECRET), null);
  });

  test("a token is valid right up to its expiry instant and not after", () => {
    const expiresAt = 1_000_000;
    const token = createSessionToken({ ...BASE, expiresAt }, SECRET);
    assert.ok(verifySessionToken(token, SECRET, expiresAt));
    assert.equal(verifySessionToken(token, SECRET, expiresAt + 1), null);
  });

  test("a token signed with a different secret is rejected", () => {
    const token = createSessionToken({ ...BASE, expiresAt: Date.now() + 60_000 }, SECRET);
    assert.equal(verifySessionToken(token, "a-different-secret"), null);
  });

  test("a tampered payload is rejected even if well-formed", () => {
    const token = createSessionToken({ ...BASE, expiresAt: Date.now() + 60_000 }, SECRET);
    const [, signature] = token.split(".");
    const tamperedBody = Buffer.from(
      JSON.stringify({ ...BASE, userId: "someone-else", expiresAt: Date.now() + 60_000 }),
    ).toString("base64url");
    assert.equal(verifySessionToken(`${tamperedBody}.${signature}`, SECRET), null);
  });

  test("garbage input is rejected rather than throwing", () => {
    assert.equal(verifySessionToken("not-a-token", SECRET), null);
    assert.equal(verifySessionToken("", SECRET), null);
    assert.equal(verifySessionToken("a.b.c", SECRET), null);
  });

  test("a token without a session id — the format before database sessions — is rejected", () => {
    const body = Buffer.from(JSON.stringify({ userId: "user-1", expiresAt: Date.now() + 60_000 })).toString(
      "base64url",
    );
    // Signed exactly as `session.ts` signs, so only the missing field is wrong.
    const signature = createHmac("sha256", deriveKey(SECRET, "session-token")).update(body).digest("base64url");
    assert.equal(verifySessionToken(`${body}.${signature}`, SECRET), null);
  });

  test("is signed with its own derived key: a token signed with the raw secret doesn't verify", () => {
    const body = Buffer.from(JSON.stringify({ ...BASE, expiresAt: Date.now() + 60_000 })).toString("base64url");
    const rawSigned = `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`;
    assert.equal(verifySessionToken(rawSigned, SECRET), null);
  });

  test("an invite link is never accepted as a session, even one whose payload is shaped like a session", () => {
    const invite = createInviteToken(
      { workspaceId: "w1", workspaceName: "Acme", email: "a@b.com", role: "VIEWER" },
      SECRET,
    );
    assert.equal(verifySessionToken(invite, SECRET), null);
  });
});
