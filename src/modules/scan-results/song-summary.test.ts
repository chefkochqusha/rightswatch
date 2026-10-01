import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { summarizeSongMatches } from "./song-summary";
import type { StoredScanItem } from "./types";
import type { RightsAssessmentStatus } from "../rights-engine/types";

const match = (trackId: string) => ({ trackId, title: trackId, artist: "A", isrc: null, confidence: 0.9, provider: "fixture", manual: false });
const post = (day: number) => ({ publishedAt: new Date(Date.UTC(2026, 8, day)) }) as StoredScanItem["content"];

function assessed(trackId: string, creatorId: string, status: RightsAssessmentStatus, day = 1): StoredScanItem {
  return {
    kind: "ASSESSED",
    content: post(day),
    musicMatch: match(trackId),
    assessment: { status, reason: null, matchedRecordIds: [], explanation: "" },
    creatorId,
    creatorExternalId: creatorId,
    creatorUsername: creatorId,
    rightsAssessmentId: `ra-${trackId}-${creatorId}-${day}`,
  };
}
function other(trackId: string, creatorId: string, day = 1): StoredScanItem {
  return { kind: "OTHER_MUSIC", content: post(day), musicMatch: match(trackId), creatorId, creatorExternalId: creatorId, creatorUsername: creatorId, rightsAssessmentId: null };
}

describe("summarizeSongMatches", () => {
  test("counts posts, creators and verdicts per song", () => {
    const [summary] = summarizeSongMatches([
      assessed("t1", "c1", "POTENTIAL_MISMATCH", 3),
      assessed("t1", "c1", "CLEARED", 5),
      assessed("t1", "c2", "REVIEW", 4),
      assessed("t1", "c3", "UNKNOWN", 2),
    ]);
    assert.equal(summary.posts, 4);
    assert.equal(summary.creators, 3);
    assert.deepEqual(
      [summary.potentialMismatch, summary.review, summary.unknown, summary.cleared, summary.other],
      [1, 1, 1, 1, 0],
    );
    assert.equal(summary.lastPostAt.getUTCDate(), 5);
  });

  test("a song outside the library counts as 'other', with no verdict", () => {
    const [summary] = summarizeSongMatches([other("t9", "c1"), other("t9", "c2")]);
    assert.equal(summary.other, 2);
    assert.equal(summary.potentialMismatch + summary.review + summary.unknown + summary.cleared, 0);
  });

  test("ignores posts without a song", () => {
    const noMusic: StoredScanItem = { kind: "NO_MUSIC_MATCH", content: post(1), creatorId: "c1", creatorExternalId: "c1", creatorUsername: "c1", rightsAssessmentId: null };
    assert.deepEqual(summarizeSongMatches([noMusic]), []);
  });

  test("puts the songs most in need of a look first", () => {
    const order = summarizeSongMatches([
      assessed("calm", "c1", "CLEARED"),
      assessed("calm", "c2", "CLEARED"),
      assessed("calm", "c3", "CLEARED"),
      assessed("waiting", "c1", "REVIEW"),
      assessed("flagged", "c1", "POTENTIAL_MISMATCH"),
    ]).map((s) => s.trackId);
    assert.deepEqual(order, ["flagged", "waiting", "calm"]);
  });
});
