import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { InMemoryScanResultRepository } from "./in-memory-repository";
import { IDENTIFICATION_NOT_COMPLETED } from "./types";
import type { ScanItemInput } from "./types";
import { demoContentFor } from "../demo-data/content";

// Lena's two September scenario posts, oldest first.
const LENA_POSTS = demoContentFor("lena.creates", new Date("2026-09-01T00:00:00Z"), new Date("2026-09-30T23:59:59Z"));
const CONTENT = LENA_POSTS[0];
const CREATOR = {
  creatorId: "creator-lena",
  creatorExternalId: CONTENT.creatorExternalId,
  creatorUsername: CONTENT.creatorUsername,
};
const MATCH = {
  trackId: "demo-track-midnight-run",
  title: "Midnight Run",
  artist: "Aiko",
  isrc: "DEMO12600001",
  confidence: 0.97,
  provider: "fixture",
  manual: false,
};

function assessed(status: "CLEARED" | "POTENTIAL_MISMATCH" = "POTENTIAL_MISMATCH", match = MATCH): ScanItemInput {
  return {
    kind: "ASSESSED",
    content: CONTENT,
    musicMatch: match,
    assessment: {
      status,
      reason: status === "CLEARED" ? null : "NO_RIGHTS_RECORD",
      matchedRecordIds: [],
      explanation: `explanation for ${status}`,
    },
    ...CREATOR,
  };
}
const noMatch: ScanItemInput = { kind: "NO_MUSIC_MATCH", content: CONTENT, ...CREATOR };
const idError: ScanItemInput = { kind: "MUSIC_ID_ERROR", content: CONTENT, error: "provider timeout", ...CREATOR };

const save = (repo: InMemoryScanResultRepository, workspaceId: string, items: ScanItemInput[]) =>
  repo.saveScan({ workspaceId, musicProviderName: "fixture", items });

describe("InMemoryScanResultRepository", () => {
  test("stores an assessed item with a rights assessment id and reads it back", async () => {
    const repo = new InMemoryScanResultRepository();
    const [stored] = await save(repo, "w1", [assessed()]);

    assert.equal(stored.kind, "ASSESSED");
    assert.ok(stored.rightsAssessmentId);
    assert.deepEqual(await repo.findByContentId("w1", CONTENT.externalContentId), stored);
    assert.deepEqual(await repo.findForWorkspace("w1"), [stored]);
  });

  test("re-saving the same track keeps the same rights assessment id — and so any Case on it", async () => {
    const repo = new InMemoryScanResultRepository();
    const [first] = await save(repo, "w1", [assessed("POTENTIAL_MISMATCH")]);
    const [second] = await save(repo, "w1", [assessed("CLEARED")]);

    assert.equal(second.rightsAssessmentId, first.rightsAssessmentId);
    assert.equal(second.kind === "ASSESSED" && second.assessment.status, "CLEARED", "the verdict itself is refreshed");
    assert.equal((await repo.findForWorkspace("w1")).length, 1, "never duplicated");
  });

  test("a different track for the same content is a different assessment", async () => {
    const repo = new InMemoryScanResultRepository();
    const [first] = await save(repo, "w1", [assessed()]);
    const [second] = await save(repo, "w1", [assessed("POTENTIAL_MISMATCH", { ...MATCH, isrc: "OTHER0000001" })]);
    assert.notEqual(second.rightsAssessmentId, first.rightsAssessmentId);
  });

  test("a later scan that finds nothing, or fails, never erases an earlier identification", async () => {
    const repo = new InMemoryScanResultRepository();
    const [first] = await save(repo, "w1", [assessed()]);

    const [afterNoMatch] = await save(repo, "w1", [noMatch]);
    assert.equal(afterNoMatch.kind, "ASSESSED");
    assert.equal(afterNoMatch.rightsAssessmentId, first.rightsAssessmentId);

    const [afterError] = await save(repo, "w1", [idError]);
    assert.equal(afterError.kind, "ASSESSED");
    assert.equal(afterError.rightsAssessmentId, first.rightsAssessmentId);
  });

  test("a failed identification reads back as 'not completed' — the provider's own text isn't kept", async () => {
    const repo = new InMemoryScanResultRepository();
    const [stored] = await save(repo, "w1", [idError]);
    assert.equal(stored.kind, "MUSIC_ID_ERROR");
    if (stored.kind === "MUSIC_ID_ERROR") assert.equal(stored.error, IDENTIFICATION_NOT_COMPLETED);
    assert.equal(stored.rightsAssessmentId, null);
  });

  test("a completed 'no track found' isn't downgraded by a later failure", async () => {
    const repo = new InMemoryScanResultRepository();
    await save(repo, "w1", [noMatch]);
    const [afterError] = await save(repo, "w1", [idError]);
    assert.equal(afterError.kind, "NO_MUSIC_MATCH");
  });

  test("workspaces are isolated: the same video in two workspaces is two items, never shared", async () => {
    const repo = new InMemoryScanResultRepository();
    const [inW1] = await save(repo, "w1", [assessed()]);
    const [inW2] = await save(repo, "w2", [assessed()]);

    assert.notEqual(inW1.rightsAssessmentId, inW2.rightsAssessmentId);
    assert.equal(await repo.findByContentId("w3", CONTENT.externalContentId), null);
    assert.equal((await repo.findForWorkspace("w1")).length, 1);
  });

  test("returns stored items in input order, and reads them back newest first", async () => {
    const repo = new InMemoryScanResultRepository();
    const [older, newer] = [LENA_POSTS[0], LENA_POSTS[1]];
    assert.ok(newer.publishedAt > older.publishedAt);
    const items: ScanItemInput[] = [
      { kind: "NO_MUSIC_MATCH", content: older, ...CREATOR },
      { kind: "NO_MUSIC_MATCH", content: newer, ...CREATOR },
    ];

    const saved = await save(repo, "w1", items);
    assert.deepEqual(saved.map((s) => s.content.externalContentId), [older.externalContentId, newer.externalContentId]);

    const read = await repo.findForWorkspace("w1");
    assert.deepEqual(read.map((s) => s.content.externalContentId), [newer.externalContentId, older.externalContentId]);
  });

  test("findForCreator returns one creator's items within one workspace", async () => {
    const repo = new InMemoryScanResultRepository();
    const [, other] = LENA_POSTS;
    await save(repo, "w1", [
      assessed(),
      { kind: "NO_MUSIC_MATCH", content: other, ...CREATOR, creatorId: "creator-someone-else" },
    ]);

    const lenas = await repo.findForCreator("w1", "creator-lena");
    assert.deepEqual(lenas.map((s) => s.content.externalContentId), [CONTENT.externalContentId]);
    assert.equal(lenas[0].creatorId, "creator-lena");
    assert.deepEqual(await repo.findForCreator("w2", "creator-lena"), []);
  });

  test("a song outside the catalogue is kept, and an assessed song outranks it", async () => {
    const repo = new InMemoryScanResultRepository();
    const other: ScanItemInput = { kind: "OTHER_MUSIC", content: CONTENT, musicMatch: { ...MATCH, trackId: "t-other" }, ...CREATOR };

    const [first] = await save(repo, "w1", [other]);
    assert.equal(first.kind, "OTHER_MUSIC");
    assert.equal(first.rightsAssessmentId, null);
    const [afterNothing] = await save(repo, "w1", [noMatch]);
    assert.equal(afterNothing.kind, "OTHER_MUSIC", "a later 'no track' doesn't erase it");

    const [assessedNow] = await save(repo, "w1", [assessed()]);
    const [otherAgain] = await save(repo, "w1", [other]);
    assert.equal(otherAgain.kind, "ASSESSED");
    assert.equal(otherAgain.rightsAssessmentId, assessedNow.rightsAssessmentId);
  });

  test("findForTrack and reassessTrack: a song's posts, assessed again in place", async () => {
    const repo = new InMemoryScanResultRepository();
    const [, second] = LENA_POSTS;
    await save(repo, "w1", [
      { kind: "OTHER_MUSIC", content: CONTENT, musicMatch: { ...MATCH, trackId: "t-1" }, ...CREATOR },
      { kind: "NO_MUSIC_MATCH", content: second, ...CREATOR },
    ]);
    assert.deepEqual((await repo.findForTrack("w1", "t-1")).map((item) => item.content.externalContentId), [CONTENT.externalContentId]);
    assert.deepEqual(await repo.findForTrack("w2", "t-1"), []);

    const seen: string[] = [];
    const verdict = (status: "UNKNOWN" | "CLEARED") => async (match: { creatorUsername: string; musicMatch: { trackId: string } }) => {
      seen.push(`${match.creatorUsername}:${match.musicMatch.trackId}`);
      return { status, reason: status === "CLEARED" ? null : ("NO_RIGHTS_RECORD" as const), matchedRecordIds: [], explanation: status };
    };
    const [first] = await repo.reassessTrack({ workspaceId: "w1", trackId: "t-1", assess: verdict("UNKNOWN") });
    assert.equal(first.kind, "ASSESSED");
    assert.deepEqual(seen, [`${CREATOR.creatorUsername}:t-1`]);

    const [again] = await repo.reassessTrack({ workspaceId: "w1", trackId: "t-1", assess: verdict("CLEARED") });
    assert.equal(again.kind === "ASSESSED" && again.assessment.status, "CLEARED");
    assert.equal(again.rightsAssessmentId, first.rightsAssessmentId, "the same assessment, so a case stays attached");
    assert.deepEqual(await repo.reassessTrack({ workspaceId: "w2", trackId: "t-1", assess: verdict("CLEARED") }), []);
  });

  test("identifyPost turns a post with no song into an assessed one, marked manual", async () => {
    const repo = new InMemoryScanResultRepository();
    await save(repo, "w1", [noMatch]);
    const track = { id: "track-1", title: "Midnight Run", artist: "Aiko", isrc: "DEMO12600001" };

    const item = await repo.identifyPost({
      workspaceId: "w1",
      externalContentId: CONTENT.externalContentId,
      track,
      assess: async (match) => {
        assert.equal(match.musicMatch.trackId, "track-1");
        return { status: "POTENTIAL_MISMATCH", reason: "NO_RIGHTS_RECORD", matchedRecordIds: [], explanation: "none" };
      },
    });

    assert.equal(item?.kind, "ASSESSED");
    assert.ok(item && item.kind === "ASSESSED" && item.musicMatch.manual && item.musicMatch.provider === "manual");
    assert.ok(item?.rightsAssessmentId);
    assert.equal((await repo.findByContentId("w1", CONTENT.externalContentId))?.kind, "ASSESSED");
  });

  test("a later scan that finds nothing doesn't undo a manual identification, and keeps its assessment id", async () => {
    const repo = new InMemoryScanResultRepository();
    await save(repo, "w1", [noMatch]);
    const item = await repo.identifyPost({
      workspaceId: "w1",
      externalContentId: CONTENT.externalContentId,
      track: { id: "track-1", title: "Midnight Run", artist: "Aiko", isrc: null },
      assess: async () => ({ status: "CLEARED", reason: null, matchedRecordIds: [], explanation: "ok" }),
    });
    await save(repo, "w1", [noMatch]);
    const after = await repo.findByContentId("w1", CONTENT.externalContentId);
    assert.equal(after?.kind, "ASSESSED");
    assert.equal(after?.rightsAssessmentId, item?.rightsAssessmentId);
  });

  test("identifyPost returns null for a post the workspace doesn't have", async () => {
    const repo = new InMemoryScanResultRepository();
    await save(repo, "w1", [noMatch]);
    const result = await repo.identifyPost({
      workspaceId: "w2",
      externalContentId: CONTENT.externalContentId,
      track: { id: "t", title: "T", artist: null, isrc: null },
      assess: async () => ({ status: "CLEARED", reason: null, matchedRecordIds: [], explanation: "" }),
    });
    assert.equal(result, null);
  });
});

