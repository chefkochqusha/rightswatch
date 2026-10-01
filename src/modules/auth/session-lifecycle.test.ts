import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { endSession, hashSessionId, resolveSession, SESSION_DURATION_MS, startSession } from "./session-lifecycle";
import { createSessionToken, verifySessionToken } from "./session";
import { InMemorySessionRepository } from "./in-memory-repositories";

const SECRET = "test-secret-do-not-use-in-real-env";

function makeDeps(now?: number) {
  return { sessionRepository: new InMemorySessionRepository(), secret: SECRET, now };
}

describe("database-backed sessions", () => {
  test("a started session resolves to its user", async () => {
    const deps = makeDeps();
    const { token } = await startSession("user-1", deps);
    assert.deepEqual(await resolveSession(token, deps), { userId: "user-1" });
  });

  test("ending a session revokes its cookie immediately — a copy of it stops working", async () => {
    const deps = makeDeps();
    const { token } = await startSession("user-1", deps);
    const copiedCookie = token;

    await endSession(token, deps);

    assert.equal(await resolveSession(copiedCookie, deps), null);
  });

  test("ending one session leaves the user's other sessions (other devices) alone", async () => {
    const deps = makeDeps();
    const laptop = await startSession("user-1", deps);
    const phone = await startSession("user-1", deps);

    await endSession(laptop.token, deps);

    assert.equal(await resolveSession(laptop.token, deps), null);
    assert.deepEqual(await resolveSession(phone.token, deps), { userId: "user-1" });
  });

  test("stores only the SHA-256 of the session id, never the id the cookie carries", async () => {
    const deps = makeDeps();
    const { token } = await startSession("user-1", deps);
    const sessionId = verifySessionToken(token, SECRET)!.sessionId;

    assert.equal(await deps.sessionRepository.findById(sessionId), null);
    assert.ok(await deps.sessionRepository.findById(hashSessionId(sessionId)));
  });

  test("expires after 7 days", async () => {
    const start = 1_000_000;
    const repo = new InMemorySessionRepository();
    const deps = { sessionRepository: repo, secret: SECRET };

    const { token, expiresAt } = await startSession("user-1", { ...deps, now: start });
    assert.equal(expiresAt, start + SESSION_DURATION_MS);
    assert.ok(await resolveSession(token, { ...deps, now: start + SESSION_DURATION_MS - 1 }));
    assert.equal(await resolveSession(token, { ...deps, now: start + SESSION_DURATION_MS }), null);
  });

  test("a genuinely signed token naming a session that was never started doesn't resolve", async () => {
    const deps = makeDeps();
    const forgedButSigned = createSessionToken(
      { userId: "user-1", sessionId: "never-started", expiresAt: Date.now() + 60_000 },
      SECRET,
    );
    assert.equal(await resolveSession(forgedButSigned, deps), null);
  });

  test("a session's token can't be re-pointed at another user", async () => {
    const deps = makeDeps();
    const { token } = await startSession("user-1", deps);
    const { sessionId, expiresAt } = verifySessionToken(token, SECRET)!;
    // Signed correctly (as if the secret had leaked), but the row says user-1.
    const reassigned = createSessionToken({ userId: "user-2", sessionId, expiresAt }, SECRET);
    assert.equal(await resolveSession(reassigned, deps), null);
  });

  test("a token with a bad signature never reaches the database", async () => {
    const deps = makeDeps();
    let lookups = 0;
    const original = deps.sessionRepository.findById.bind(deps.sessionRepository);
    deps.sessionRepository.findById = async (id) => {
      lookups += 1;
      return original(id);
    };
    assert.equal(await resolveSession("garbage.token", deps), null);
    assert.equal(lookups, 0);
  });

  test("ending a session with a garbage or foreign token is a harmless no-op", async () => {
    const deps = makeDeps();
    const { token } = await startSession("user-1", deps);
    await endSession("garbage", deps);
    await endSession(createSessionToken({ userId: "x", sessionId: "y", expiresAt: 1 }, "other-secret"), deps);
    assert.deepEqual(await resolveSession(token, deps), { userId: "user-1" });
  });

  test("an expired but genuine token still ends its session row", async () => {
    const start = 1_000_000;
    const repo = new InMemorySessionRepository();
    const { token } = await startSession("user-1", { sessionRepository: repo, secret: SECRET, now: start });
    const id = hashSessionId(verifySessionToken(token, SECRET, start)!.sessionId);

    await endSession(token, { sessionRepository: repo, secret: SECRET, now: start + 2 * SESSION_DURATION_MS });
    assert.equal(await repo.findById(id), null);
  });

  test("starting a session sweeps out that user's expired rows, and only that user's", async () => {
    const repo = new InMemorySessionRepository();
    const deps = { sessionRepository: repo, secret: SECRET };
    const start = 1_000_000;
    const rowId = (token: string) => hashSessionId(verifySessionToken(token, SECRET, 0)!.sessionId);

    const oldUser1 = await startSession("user-1", { ...deps, now: start });
    const oldUser2 = await startSession("user-2", { ...deps, now: start });

    const later = start + SESSION_DURATION_MS + 1;
    const freshUser1 = await startSession("user-1", { ...deps, now: later });

    assert.equal(await repo.findById(rowId(oldUser1.token)), null, "user-1's expired row is gone");
    assert.ok(await repo.findById(rowId(freshUser1.token)), "the new one exists");
    assert.ok(await repo.findById(rowId(oldUser2.token)), "user-2's rows are user-2's business");
  });
});
