import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryUserRepository } from "./in-memory-repositories";
import { InMemoryRateLimiter } from "./rate-limiter";
import { EMAIL_VERIFICATION_TTL_MS, createEmailVerificationToken, sendEmailVerification, verifyEmail } from "./email-verification";
import { createPasswordResetToken } from "./password-reset-token";

const SECRET = "s".repeat(40);

async function setup() {
  const userRepository = new InMemoryUserRepository();
  const user = await userRepository.create({ email: "nina@northstar.test", passwordHash: "hash", name: "Nina" });
  const sent: { to: string; link: string }[] = [];
  const send = (rateLimiter?: InMemoryRateLimiter) =>
    sendEmailVerification(user.id, {
      userRepository,
      rateLimiter,
      secret: SECRET,
      linkFor: (t) => `https://app.test/verify-email?token=${t}`,
      sendLink: async (to, link) => void sent.push({ to, link }),
    });
  const tokenFrom = (link: string) => new URL(link).searchParams.get("token")!;
  return { userRepository, user, sent, send, tokenFrom };
}

describe("email verification", () => {
  test("a new user is unverified; the emailed link confirms the address", async () => {
    const { userRepository, user, sent, send, tokenFrom } = await setup();
    assert.equal(user.emailVerifiedAt, null);
    assert.deepEqual(await send(), { ok: true });
    assert.equal(sent[0].to, "nina@northstar.test");

    assert.deepEqual(await verifyEmail(tokenFrom(sent[0].link), { userRepository, secret: SECRET }), { ok: true });
    assert.ok((await userRepository.findById(user.id))!.emailVerifiedAt instanceof Date);
  });

  test("opening the link twice keeps the first time", async () => {
    const { userRepository, user, sent, send, tokenFrom } = await setup();
    await send();
    const token = tokenFrom(sent[0].link);
    await verifyEmail(token, { userRepository, secret: SECRET, now: Date.now() });
    const first = (await userRepository.findById(user.id))!.emailVerifiedAt;
    assert.deepEqual(await verifyEmail(token, { userRepository, secret: SECRET, now: Date.now() + 1000 }), { ok: true });
    assert.equal((await userRepository.findById(user.id))!.emailVerifiedAt?.getTime(), first?.getTime());
  });

  test("nothing is sent to an address that is already confirmed", async () => {
    const { userRepository, user, sent, send } = await setup();
    await userRepository.markEmailVerified(user.id, new Date());
    assert.deepEqual(await send(), { ok: false, error: "ALREADY_VERIFIED" });
    assert.equal(sent.length, 0);
  });

  test("an expired, tampered or foreign token is refused", async () => {
    const { userRepository, user } = await setup();
    const token = createEmailVerificationToken(user, SECRET, 0);
    assert.deepEqual(await verifyEmail(token, { userRepository, secret: SECRET, now: EMAIL_VERIFICATION_TTL_MS + 1 }), { ok: false, error: "INVALID_TOKEN" });

    const fresh = createEmailVerificationToken(user, SECRET);
    const tampered = fresh.slice(0, -2) + (fresh.endsWith("A") ? "BB" : "AA");
    assert.deepEqual(await verifyEmail(tampered, { userRepository, secret: SECRET }), { ok: false, error: "INVALID_TOKEN" });
    assert.deepEqual(await verifyEmail(fresh, { userRepository, secret: "o".repeat(40) }), { ok: false, error: "INVALID_TOKEN" });
    // A password-reset link is signed with another key and can't confirm an address.
    assert.deepEqual(await verifyEmail(createPasswordResetToken(user, SECRET), { userRepository, secret: SECRET }), { ok: false, error: "INVALID_TOKEN" });
    assert.equal((await userRepository.findById(user.id))!.emailVerifiedAt, null);
  });

  test("a link for a different user's id with a stale address is refused", async () => {
    const { userRepository, user } = await setup();
    const token = createEmailVerificationToken({ id: user.id, email: "old@northstar.test" }, SECRET);
    assert.deepEqual(await verifyEmail(token, { userRepository, secret: SECRET }), { ok: false, error: "INVALID_TOKEN" });
  });

  test("resending is rate limited", async () => {
    const { sent, send } = await setup();
    const limiter = new InMemoryRateLimiter({ maxAttempts: 3 });
    for (let i = 0; i < 5; i++) await send(limiter);
    assert.equal(sent.length, 3);
  });
});
