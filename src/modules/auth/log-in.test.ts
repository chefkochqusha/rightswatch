import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { signUp } from "./sign-up";
import { logIn } from "./log-in";
import { InMemoryRateLimiter } from "./rate-limiter";
import {
  InMemoryUserRepository,
  InMemoryWorkspaceRepository,
  InMemoryMembershipRepository,
} from "./in-memory-repositories";

async function makeUser() {
  const userRepository = new InMemoryUserRepository();
  await signUp(
    { email: "jane@acme.com", password: "correct horse", name: "Jane", workspaceName: "Acme" },
    {
      userRepository,
      workspaceRepository: new InMemoryWorkspaceRepository(),
      membershipRepository: new InMemoryMembershipRepository(),
    },
  );
  return userRepository;
}

describe("logIn", () => {
  test("succeeds with the correct email and password", async () => {
    const userRepository = await makeUser();
    const result = await logIn({ email: "jane@acme.com", password: "correct horse" }, { userRepository });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.user.email, "jane@acme.com");
  });

  test("login is case-insensitive on email", async () => {
    const userRepository = await makeUser();
    const result = await logIn({ email: "JANE@ACME.COM", password: "correct horse" }, { userRepository });
    assert.equal(result.ok, true);
  });

  test("fails with the wrong password", async () => {
    const userRepository = await makeUser();
    const result = await logIn({ email: "jane@acme.com", password: "wrong password" }, { userRepository });
    assert.deepEqual(result, { ok: false, error: "INVALID_CREDENTIALS" });
  });

  test("fails for an email that was never registered, with the same error as a wrong password", async () => {
    const userRepository = await makeUser();
    const result = await logIn(
      { email: "nobody@acme.com", password: "correct horse" },
      { userRepository },
    );
    assert.deepEqual(result, { ok: false, error: "INVALID_CREDENTIALS" });
  });

  test("with no rateLimiter passed, wrong passwords never get blocked", async () => {
    const userRepository = await makeUser();
    for (let i = 0; i < 10; i++) {
      const result = await logIn(
        { email: "jane@acme.com", password: "wrong" },
        { userRepository },
      );
      assert.deepEqual(result, { ok: false, error: "INVALID_CREDENTIALS" });
    }
  });

  test("blocks after 5 failed attempts, with a rateLimiter passed", async () => {
    const userRepository = await makeUser();
    const rateLimiter = new InMemoryRateLimiter();

    for (let i = 0; i < 5; i++) {
      const result = await logIn(
        { email: "jane@acme.com", password: "wrong" },
        { userRepository, rateLimiter },
      );
      assert.deepEqual(result, { ok: false, error: "INVALID_CREDENTIALS" });
    }

    const sixthTry = await logIn(
      { email: "jane@acme.com", password: "correct horse" }, // even the right password now
      { userRepository, rateLimiter },
    );
    assert.equal(sixthTry.ok, false);
    if (!sixthTry.ok) assert.equal(sixthTry.error, "RATE_LIMITED");
  });

  test("a successful login resets the failure count for that email", async () => {
    const userRepository = await makeUser();
    const rateLimiter = new InMemoryRateLimiter();

    for (let i = 0; i < 4; i++) {
      await logIn({ email: "jane@acme.com", password: "wrong" }, { userRepository, rateLimiter });
    }
    const success = await logIn(
      { email: "jane@acme.com", password: "correct horse" },
      { userRepository, rateLimiter },
    );
    assert.equal(success.ok, true);

    // Another 4 failures right after a success still shouldn't trip the
    // limiter, since the successful login reset the counter to zero.
    for (let i = 0; i < 4; i++) {
      const result = await logIn(
        { email: "jane@acme.com", password: "wrong" },
        { userRepository, rateLimiter },
      );
      assert.deepEqual(result, { ok: false, error: "INVALID_CREDENTIALS" });
    }
  });

  test("rate limiting is per-email — attacking one account doesn't lock out another", async () => {
    const userRepository = await makeUser();
    await signUp(
      { email: "sam@acme.com", password: "another password", name: null, workspaceName: "Acme" },
      {
        userRepository,
        workspaceRepository: new InMemoryWorkspaceRepository(),
        membershipRepository: new InMemoryMembershipRepository(),
      },
    );
    const rateLimiter = new InMemoryRateLimiter();

    for (let i = 0; i < 5; i++) {
      await logIn({ email: "jane@acme.com", password: "wrong" }, { userRepository, rateLimiter });
    }

    const samResult = await logIn(
      { email: "sam@acme.com", password: "another password" },
      { userRepository, rateLimiter },
    );
    assert.equal(samResult.ok, true);
  });
});
