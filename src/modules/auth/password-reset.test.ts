import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryUserRepository, InMemorySessionRepository } from "./in-memory-repositories";
import { InMemoryRateLimiter } from "./rate-limiter";
import { hashPassword, verifyPassword } from "./password";
import { requestPasswordReset, resetPassword } from "./password-reset";
import { createPasswordResetToken, PASSWORD_RESET_TTL_MS } from "./password-reset-token";
import { createSessionToken, verifySessionToken } from "./session";

const SECRET = "x".repeat(40);

async function setup() {
  const userRepository = new InMemoryUserRepository();
  const sessionRepository = new InMemorySessionRepository();
  const user = await userRepository.create({ email: "nina@northstar.test", passwordHash: await hashPassword("old-password-1"), name: "Nina" });
  const sent: { to: string; link: string }[] = [];
  const request = (email: string, rateLimiter?: InMemoryRateLimiter) =>
    requestPasswordReset(
      { email },
      { userRepository, rateLimiter, secret: SECRET, linkFor: (t) => `https://app.test/reset-password?token=${t}`, sendResetLink: async (to, link) => void sent.push({ to, link }) },
    );
  const tokenFrom = (link: string) => new URL(link).searchParams.get("token")!;
  return { userRepository, sessionRepository, user, sent, request, tokenFrom };
}

describe("password reset", () => {
  test("sends a link to a known email, and says the same for an unknown one", async () => {
    const { sent, request } = await setup();
    assert.deepEqual(await request("Nina@Northstar.test"), { ok: true });
    assert.deepEqual(await request("nobody@nowhere.test"), { ok: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "nina@northstar.test");
  });

  test("one inbox gets at most three links per window", async () => {
    const { sent, request } = await setup();
    const limiter = new InMemoryRateLimiter({ maxAttempts: 3 });
    for (let i = 0; i < 6; i++) await request("nina@northstar.test", limiter);
    assert.equal(sent.length, 3);
  });

  test("the link sets a new password and ends every session", async () => {
    const { userRepository, sessionRepository, user, sent, request, tokenFrom } = await setup();
    await sessionRepository.create({ id: "s1", userId: user.id, expiresAt: new Date(Date.now() + 1e6) });
    await sessionRepository.create({ id: "s2", userId: user.id, expiresAt: new Date(Date.now() + 1e6) });
    await request("nina@northstar.test");

    const result = await resetPassword({ token: tokenFrom(sent[0].link), newPassword: "brand-new-password" }, { userRepository, sessionRepository, secret: SECRET });
    assert.equal(result.ok, true);
    const updated = await userRepository.findById(user.id);
    assert.ok(updated && (await verifyPassword("brand-new-password", updated.passwordHash)));
    assert.equal(await sessionRepository.findById("s1"), null);
    assert.equal(await sessionRepository.findById("s2"), null);
  });

  test("a link works once: after the password changes it is dead", async () => {
    const { userRepository, sessionRepository, sent, request, tokenFrom } = await setup();
    await request("nina@northstar.test");
    const token = tokenFrom(sent[0].link);
    const deps = { userRepository, sessionRepository, secret: SECRET };
    assert.equal((await resetPassword({ token, newPassword: "first-new-password" }, deps)).ok, true);
    assert.deepEqual(await resetPassword({ token, newPassword: "second-new-password" }, deps), { ok: false, error: "INVALID_TOKEN" });
  });

  test("an expired, tampered or foreign token is rejected", async () => {
    const { userRepository, sessionRepository, user } = await setup();
    const deps = { userRepository, sessionRepository, secret: SECRET };
    const now = Date.now();
    const fresh = createPasswordResetToken(user, SECRET, now);
    assert.equal((await resetPassword({ token: fresh, newPassword: "long-enough-pw" }, { ...deps, now: now + PASSWORD_RESET_TTL_MS + 1 })).ok, false);
    const [body, sig] = fresh.split(".");
    assert.equal((await resetPassword({ token: `${body}.${sig.slice(0, -2)}AA`, newPassword: "long-enough-pw" }, deps)).ok, false);
    assert.equal((await resetPassword({ token: "garbage", newPassword: "long-enough-pw" }, deps)).ok, false);
    // A session cookie signed with the same secret is not a reset link.
    const sessionToken = createSessionToken({ userId: user.id, sessionId: "s1", expiresAt: now + 1e6 }, SECRET);
    assert.ok(verifySessionToken(sessionToken, SECRET));
    assert.equal((await resetPassword({ token: sessionToken, newPassword: "long-enough-pw" }, deps)).ok, false);
  });

  test("a too-short password is refused and the old one keeps working", async () => {
    const { userRepository, sessionRepository, user, sent, request, tokenFrom } = await setup();
    await request("nina@northstar.test");
    const result = await resetPassword({ token: tokenFrom(sent[0].link), newPassword: "short" }, { userRepository, sessionRepository, secret: SECRET });
    assert.deepEqual(result, { ok: false, error: "WEAK_PASSWORD" });
    const same = await userRepository.findById(user.id);
    assert.ok(same && (await verifyPassword("old-password-1", same.passwordHash)));
  });
});
