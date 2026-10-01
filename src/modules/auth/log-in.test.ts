import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { signUp } from "./sign-up";
import { logIn } from "./log-in";
import { InMemoryRateLimiter } from "./rate-limiter";
import { needsRehash, verifyPassword } from "./password";
import {
  InMemoryUserRepository,
  InMemoryWorkspaceRepository,
  InMemoryMembershipRepository,
  InMemoryAccountRepository,
} from "./in-memory-repositories";

async function signUpInto(userRepository: InMemoryUserRepository, email: string, password: string) {
  const workspaceRepository = new InMemoryWorkspaceRepository();
  const membershipRepository = new InMemoryMembershipRepository();
  await signUp(
    { email, password, name: null, workspaceName: "Acme" },
    {
      userRepository,
      workspaceRepository,
      accountRepository: new InMemoryAccountRepository(userRepository, workspaceRepository, membershipRepository),
    },
  );
}

async function makeUser() {
  const userRepository = new InMemoryUserRepository();
  await signUpInto(userRepository, "jane@acme.com", "correct horse");
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
    const result = await logIn({ email: "nobody@acme.com", password: "correct horse" }, { userRepository });
    assert.deepEqual(result, { ok: false, error: "INVALID_CREDENTIALS" });
  });

  test("an unknown email takes about as long as a wrong password — no timing oracle for registered emails", async () => {
    const userRepository = await makeUser();
    const time = async (email: string) => {
      const start = performance.now();
      for (let i = 0; i < 3; i++) await logIn({ email, password: "wrong" }, { userRepository });
      return performance.now() - start;
    };
    const known = await time("jane@acme.com");
    const unknown = await time("nobody@acme.com");
    // Before the fix an unknown email skipped scrypt entirely: ~0 ms vs tens of ms.
    assert.ok(unknown > known * 0.5, `unknown ${unknown.toFixed(0)}ms vs known ${known.toFixed(0)}ms`);
  });

  test("with no rateLimiter passed, wrong passwords never get blocked", async () => {
    const userRepository = await makeUser();
    for (let i = 0; i < 10; i++) {
      const result = await logIn({ email: "jane@acme.com", password: "wrong" }, { userRepository });
      assert.deepEqual(result, { ok: false, error: "INVALID_CREDENTIALS" });
    }
  });
});

describe("logIn rate limiting", () => {
  test("blocks after 5 failed attempts, with a rateLimiter passed", async () => {
    const userRepository = await makeUser();
    const rateLimiter = new InMemoryRateLimiter();

    for (let i = 0; i < 5; i++) {
      const result = await logIn({ email: "jane@acme.com", password: "wrong" }, { userRepository, rateLimiter });
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
    const success = await logIn({ email: "jane@acme.com", password: "correct horse" }, { userRepository, rateLimiter });
    assert.equal(success.ok, true);

    for (let i = 0; i < 4; i++) {
      const result = await logIn({ email: "jane@acme.com", password: "wrong" }, { userRepository, rateLimiter });
      assert.deepEqual(result, { ok: false, error: "INVALID_CREDENTIALS" });
    }
  });

  test("attacking one account doesn't lock out another", async () => {
    const userRepository = await makeUser();
    await signUpInto(userRepository, "sam@acme.com", "another password");
    const rateLimiter = new InMemoryRateLimiter();

    for (let i = 0; i < 5; i++) {
      await logIn({ email: "jane@acme.com", password: "wrong" }, { userRepository, rateLimiter });
    }

    const samResult = await logIn({ email: "sam@acme.com", password: "another password" }, { userRepository, rateLimiter });
    assert.equal(samResult.ok, true);
  });

  test("an attacker's failures from one address don't lock the owner out from theirs", async () => {
    const userRepository = await makeUser();
    const rateLimiter = new InMemoryRateLimiter();

    for (let i = 0; i < 5; i++) {
      await logIn({ email: "jane@acme.com", password: "wrong", clientIp: "203.0.113.9" }, { userRepository, rateLimiter });
    }
    const attackerAgain = await logIn(
      { email: "jane@acme.com", password: "correct horse", clientIp: "203.0.113.9" },
      { userRepository, rateLimiter },
    );
    assert.equal(attackerAgain.ok, false, "the attacker's own address is blocked");

    const owner = await logIn(
      { email: "jane@acme.com", password: "correct horse", clientIp: "198.51.100.4" },
      { userRepository, rateLimiter },
    );
    assert.equal(owner.ok, true, "the owner, elsewhere, still gets in");
  });

  test("one address spraying many accounts is blocked across all of them", async () => {
    const userRepository = await makeUser();
    const rateLimiter = new InMemoryRateLimiter();
    const ipRateLimiter = new InMemoryRateLimiter({ maxAttempts: 3 });
    const deps = { userRepository, rateLimiter, ipRateLimiter };

    for (const email of ["a@x.com", "b@x.com", "c@x.com"]) {
      await logIn({ email, password: "guess", clientIp: "203.0.113.9" }, deps);
    }
    const next = await logIn({ email: "jane@acme.com", password: "correct horse", clientIp: "203.0.113.9" }, deps);
    assert.equal(next.ok, false);
    if (!next.ok) assert.equal(next.error, "RATE_LIMITED");
  });

  test("logging into your own account doesn't reset your address's spraying count", async () => {
    const userRepository = await makeUser();
    const ipRateLimiter = new InMemoryRateLimiter({ maxAttempts: 3 });
    const deps = { userRepository, rateLimiter: new InMemoryRateLimiter(), ipRateLimiter };
    const ip = "203.0.113.9";

    await logIn({ email: "a@x.com", password: "guess", clientIp: ip }, deps);
    await logIn({ email: "b@x.com", password: "guess", clientIp: ip }, deps);
    assert.equal((await logIn({ email: "jane@acme.com", password: "correct horse", clientIp: ip }, deps)).ok, true);
    await logIn({ email: "c@x.com", password: "guess", clientIp: ip }, deps);

    assert.equal(ipRateLimiter.isBlocked(ip).blocked, true, "3 failures from one address, regardless of the success between");
  });
});

describe("logIn re-hashing", () => {
  test("a password stored in the old format is re-stored at the current cost on a successful login", async () => {
    const userRepository = new InMemoryUserRepository();
    const salt = randomBytes(16);
    const legacy = `${salt.toString("hex")}:${scryptSync("old password", salt, 64).toString("hex")}`;
    const user = await userRepository.create({ email: "old@acme.com", passwordHash: legacy, name: null });

    const result = await logIn({ email: "old@acme.com", password: "old password" }, { userRepository });
    assert.equal(result.ok, true);

    const stored = (await userRepository.findById(user.id))!.passwordHash;
    assert.notEqual(stored, legacy);
    assert.equal(needsRehash(stored), false);
    assert.equal(await verifyPassword("old password", stored), true);
  });

  test("a failed re-hash never turns a correct login into an error", async () => {
    const userRepository = new InMemoryUserRepository();
    const salt = randomBytes(16);
    const legacy = `${salt.toString("hex")}:${scryptSync("old password", salt, 64).toString("hex")}`;
    await userRepository.create({ email: "old@acme.com", passwordHash: legacy, name: null });
    userRepository.updatePasswordHash = async () => {
      throw new Error("database unavailable");
    };

    const originalError = console.error;
    console.error = () => {};
    try {
      const result = await logIn({ email: "old@acme.com", password: "old password" }, { userRepository });
      assert.equal(result.ok, true);
    } finally {
      console.error = originalError;
    }
  });
});
