import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { InMemoryCreatorRepository } from "./in-memory-repository";
import {
  addCreator,
  pauseCreator,
  removeCreator,
  resumeCreator,
  scanOutcomeChanges,
  updateCreatorDetails,
} from "./watchlist";
import type { CreatorAllowance } from "./types";

const STARTER: CreatorAllowance = { cap: 50, planName: "Starter" };

function setup(allowance: CreatorAllowance = STARTER) {
  const creatorRepository = new InMemoryCreatorRepository();
  return { creatorRepository, deps: { creatorRepository, allowance } };
}

describe("addCreator", () => {
  test("adds a monitored, not-yet-scanned creator with its profile link", async () => {
    const { deps } = setup();
    const result = await addCreator(
      { workspaceId: "w1", username: "@Lena.Creates", displayName: "Lena Creates", country: "de", followerCount: "182K" },
      deps,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.restored, false);
    assert.equal(result.creator.handle, "lena.creates");
    assert.equal(result.creator.externalId, "lena.creates");
    assert.equal(result.creator.profileUrl, "https://www.tiktok.com/@lena.creates");
    assert.equal(result.creator.country, "DE");
    assert.equal(result.creator.followerCount, 182_000);
    assert.equal(result.creator.status, "PENDING");
    assert.equal(result.creator.monitoringEnabled, true);
  });

  test("refuses a creator already on the watchlist", async () => {
    const { deps } = setup();
    await addCreator({ workspaceId: "w1", username: "lena.creates" }, deps);
    assert.deepEqual(await addCreator({ workspaceId: "w1", username: "@LENA.CREATES" }, deps), {
      ok: false,
      error: "ALREADY_ON_WATCHLIST",
    });
  });

  test("the same username in another workspace is a different creator", async () => {
    const { deps } = setup();
    await addCreator({ workspaceId: "w1", username: "lena.creates" }, deps);
    const other = await addCreator({ workspaceId: "w2", username: "lena.creates" }, deps);
    assert.equal(other.ok, true);
  });

  test("passes on invalid input without writing anything", async () => {
    const { deps, creatorRepository } = setup();
    assert.deepEqual(await addCreator({ workspaceId: "w1", username: "lena creates" }, deps), {
      ok: false,
      error: "USERNAME_INVALID",
    });
    assert.deepEqual(await addCreator({ workspaceId: "w1", username: "lena", country: "Germany" }, deps), {
      ok: false,
      error: "COUNTRY_INVALID",
    });
    assert.equal((await creatorRepository.findForWorkspace("w1")).length, 0);
  });

  test("needs a plan, and stops at the plan's limit (Brief §19)", async () => {
    const noPlan = setup({ cap: 0, planName: null });
    assert.deepEqual(await addCreator({ workspaceId: "w1", username: "lena.creates" }, noPlan.deps), {
      ok: false,
      error: "NO_PLAN",
    });

    const { deps } = setup({ cap: 2, planName: "Tiny" });
    assert.equal((await addCreator({ workspaceId: "w1", username: "one1" }, deps)).ok, true);
    assert.equal((await addCreator({ workspaceId: "w1", username: "two2" }, deps)).ok, true);
    assert.deepEqual(await addCreator({ workspaceId: "w1", username: "three3" }, deps), {
      ok: false,
      error: "LIMIT_REACHED",
    });
  });

  test("a paused creator doesn't count towards the limit", async () => {
    const { deps } = setup({ cap: 1, planName: "Tiny" });
    const first = await addCreator({ workspaceId: "w1", username: "one1" }, deps);
    assert.ok(first.ok);
    await pauseCreator({ workspaceId: "w1", creatorId: first.creator.id }, deps);
    assert.equal((await addCreator({ workspaceId: "w1", username: "two2" }, deps)).ok, true);
  });

  test("re-adding a removed creator restores the same record, keeping details not re-entered", async () => {
    const { deps } = setup();
    const added = await addCreator({ workspaceId: "w1", username: "lena.creates", country: "DE" }, deps);
    assert.ok(added.ok);
    await removeCreator({ workspaceId: "w1", creatorId: added.creator.id }, deps);

    const again = await addCreator({ workspaceId: "w1", username: "lena.creates", followerCount: "200k" }, deps);
    assert.ok(again.ok);
    assert.equal(again.restored, true);
    assert.equal(again.creator.id, added.creator.id);
    assert.equal(again.creator.removedAt, null);
    assert.equal(again.creator.monitoringEnabled, true);
    assert.equal(again.creator.country, "DE");
    assert.equal(again.creator.followerCount, 200_000);
  });
});

describe("pause, resume, remove", () => {
  test("pause and resume switch monitoring and status, and are idempotent", async () => {
    const { deps } = setup();
    const added = await addCreator({ workspaceId: "w1", username: "lena.creates" }, deps);
    assert.ok(added.ok);
    const ref = { workspaceId: "w1", creatorId: added.creator.id };

    const paused = await pauseCreator(ref, deps);
    assert.ok(paused.ok);
    assert.equal(paused.creator.monitoringEnabled, false);
    assert.equal(paused.creator.status, "PAUSED");
    assert.ok((await pauseCreator(ref, deps)).ok);

    const resumed = await resumeCreator(ref, deps);
    assert.ok(resumed.ok);
    assert.equal(resumed.creator.monitoringEnabled, true);
    assert.equal(resumed.creator.status, "PENDING", "never scanned yet");
  });

  test("resume reads ACTIVE for a creator a scan has reached", async () => {
    const { deps, creatorRepository } = setup();
    const added = await addCreator({ workspaceId: "w1", username: "lena.creates" }, deps);
    assert.ok(added.ok);
    await creatorRepository.update(added.creator.id, scanOutcomeChanges(added.creator, { at: new Date(), error: null }));
    const ref = { workspaceId: "w1", creatorId: added.creator.id };
    await pauseCreator(ref, deps);
    const resumed = await resumeCreator(ref, deps);
    assert.ok(resumed.ok);
    assert.equal(resumed.creator.status, "ACTIVE");
  });

  test("resume respects the plan limit", async () => {
    const { deps } = setup({ cap: 1, planName: "Tiny" });
    const first = await addCreator({ workspaceId: "w1", username: "one1" }, deps);
    assert.ok(first.ok);
    await pauseCreator({ workspaceId: "w1", creatorId: first.creator.id }, deps);
    await addCreator({ workspaceId: "w1", username: "two2" }, deps);
    assert.deepEqual(await resumeCreator({ workspaceId: "w1", creatorId: first.creator.id }, deps), {
      ok: false,
      error: "LIMIT_REACHED",
    });
  });

  test("remove takes the creator off the watchlist and out of the count", async () => {
    const { deps, creatorRepository } = setup();
    const added = await addCreator({ workspaceId: "w1", username: "lena.creates" }, deps);
    assert.ok(added.ok);
    assert.deepEqual(await removeCreator({ workspaceId: "w1", creatorId: added.creator.id }, deps), { ok: true });
    assert.deepEqual(await creatorRepository.findForWorkspace("w1"), []);
    assert.equal(await creatorRepository.countMonitored("w1"), 0);
    // A removed creator can't be paused, resumed or removed again.
    const ref = { workspaceId: "w1", creatorId: added.creator.id };
    assert.deepEqual(await pauseCreator(ref, deps), { ok: false, error: "NOT_FOUND" });
    assert.deepEqual(await removeCreator(ref, deps), { ok: false, error: "NOT_FOUND" });
  });

  test("another workspace's creator is not found", async () => {
    const { deps } = setup();
    const added = await addCreator({ workspaceId: "w1", username: "lena.creates" }, deps);
    assert.ok(added.ok);
    const foreign = { workspaceId: "w2", creatorId: added.creator.id };
    assert.deepEqual(await pauseCreator(foreign, deps), { ok: false, error: "NOT_FOUND" });
    assert.deepEqual(await removeCreator(foreign, deps), { ok: false, error: "NOT_FOUND" });
    assert.deepEqual(await updateCreatorDetails({ ...foreign, displayName: "x" }, deps), { ok: false, error: "NOT_FOUND" });
  });
});

describe("updateCreatorDetails", () => {
  test("replaces the details, an empty field clearing it", async () => {
    const { deps } = setup();
    const added = await addCreator({ workspaceId: "w1", username: "lena.creates", country: "DE", displayName: "Lena" }, deps);
    assert.ok(added.ok);
    const updated = await updateCreatorDetails(
      { workspaceId: "w1", creatorId: added.creator.id, displayName: "Lena Creates", country: "", followerCount: "96k" },
      deps,
    );
    assert.ok(updated.ok);
    assert.equal(updated.creator.displayName, "Lena Creates");
    assert.equal(updated.creator.country, null);
    assert.equal(updated.creator.followerCount, 96_000);
  });
});

describe("scanOutcomeChanges", () => {
  const at = new Date("2026-10-01T12:00:00Z");

  test("a scan that reached a monitored creator makes it ACTIVE and clears any error", () => {
    assert.deepEqual(scanOutcomeChanges({ monitoringEnabled: true }, { at, error: null }), {
      lastSeenAt: at,
      lastError: null,
      status: "ACTIVE",
    });
  });

  test("a failed fetch is an ERROR with its reason, and lastSeenAt stays", () => {
    assert.deepEqual(scanOutcomeChanges({ monitoringEnabled: true }, { at, error: "TikTok rate limit" }), {
      lastError: "TikTok rate limit",
      status: "ERROR",
    });
  });

  test("a creator paused mid-scan stays paused", () => {
    assert.deepEqual(scanOutcomeChanges({ monitoringEnabled: false }, { at, error: null }), {
      lastSeenAt: at,
      lastError: null,
    });
  });
});
