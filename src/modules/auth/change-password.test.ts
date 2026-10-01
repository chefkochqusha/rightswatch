import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryUserRepository, InMemorySessionRepository } from "./in-memory-repositories";
import { InMemoryRateLimiter } from "./rate-limiter";
import { hashPassword, verifyPassword } from "./password";
import { changePassword } from "./change-password";

async function setup() {
  const userRepository = new InMemoryUserRepository();
  const sessionRepository = new InMemorySessionRepository();
  const user = await userRepository.create({ email: "nina@northstar.test", passwordHash: await hashPassword("old-password-1"), name: "Nina" });
  return { userRepository, sessionRepository, user };
}

describe("changePassword", () => {
  test("changes the password and ends the user's sessions", async () => {
    const { userRepository, sessionRepository, user } = await setup();
    const session = await sessionRepository.create({ id: "session-1", userId: user.id, expiresAt: new Date(Date.now() + 60_000) });
    const result = await changePassword(
      { userId: user.id, currentPassword: "old-password-1", newPassword: "new-password-2" },
      { userRepository, sessionRepository },
    );
    assert.deepEqual(result, { ok: true });
    const stored = await userRepository.findById(user.id);
    assert.ok(await verifyPassword("new-password-2", stored!.passwordHash));
    assert.equal(await sessionRepository.findById(session.id), null);
  });

  test("refuses a wrong current password and leaves the password alone", async () => {
    const { userRepository, sessionRepository, user } = await setup();
    const result = await changePassword(
      { userId: user.id, currentPassword: "not-it", newPassword: "new-password-2" },
      { userRepository, sessionRepository },
    );
    assert.deepEqual(result, { ok: false, error: "WRONG_PASSWORD" });
    assert.ok(await verifyPassword("old-password-1", (await userRepository.findById(user.id))!.passwordHash));
  });

  test("refuses a short or unchanged new password", async () => {
    const { userRepository, sessionRepository, user } = await setup();
    const deps = { userRepository, sessionRepository };
    assert.deepEqual(await changePassword({ userId: user.id, currentPassword: "old-password-1", newPassword: "short" }, deps), { ok: false, error: "WEAK_PASSWORD" });
    assert.deepEqual(await changePassword({ userId: user.id, currentPassword: "old-password-1", newPassword: "old-password-1" }, deps), { ok: false, error: "SAME_PASSWORD" });
  });

  test("blocks guessing the current password after repeated failures", async () => {
    const { userRepository, sessionRepository, user } = await setup();
    const rateLimiter = new InMemoryRateLimiter({ maxAttempts: 3 });
    const deps = { userRepository, sessionRepository, rateLimiter };
    for (let i = 0; i < 3; i++) await changePassword({ userId: user.id, currentPassword: "guess", newPassword: "new-password-2" }, deps);
    // Even the right password is refused while blocked.
    assert.deepEqual(
      await changePassword({ userId: user.id, currentPassword: "old-password-1", newPassword: "new-password-2" }, deps),
      { ok: false, error: "RATE_LIMITED" },
    );
  });

  test("reports an unknown user", async () => {
    const { userRepository, sessionRepository } = await setup();
    assert.deepEqual(
      await changePassword({ userId: "nope", currentPassword: "x", newPassword: "new-password-2" }, { userRepository, sessionRepository }),
      { ok: false, error: "NO_SUCH_USER" },
    );
  });
});
