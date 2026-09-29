import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getRightsAssessmentId, getContentIdFromRightsAssessmentId } from "./workspace-scan-store";

/**
 * Covers only the two pure, stateless id-format helpers this file exports.
 * The rest of `workspace-scan-store.ts` (`runSampleScanForWorkspace` and
 * friends) is storage-backed and pipeline-driven, and is verified instead
 * by this project's Playwright E2E pass against a running dev server — the
 * same split `ARCHITECTURE.md`'s "Testing & verification conventions"
 * describes for HTTP-surfaced code generally.
 */
describe("getRightsAssessmentId / getContentIdFromRightsAssessmentId", () => {
  test("decoding the id getRightsAssessmentId minted recovers the original contentId", () => {
    const id = getRightsAssessmentId("workspace-1", "tt-cc-3001");
    assert.equal(getContentIdFromRightsAssessmentId("workspace-1", id), "tt-cc-3001");
  });

  test("is stable across repeated calls with the same inputs", () => {
    const first = getRightsAssessmentId("workspace-1", "tt-cc-3001");
    const second = getRightsAssessmentId("workspace-1", "tt-cc-3001");
    assert.equal(first, second);
  });

  test("two different workspaces never collide on the same contentId", () => {
    const a = getRightsAssessmentId("workspace-a", "tt-cc-3001");
    const b = getRightsAssessmentId("workspace-b", "tt-cc-3001");
    assert.notEqual(a, b);
  });

  test("decoding with the wrong workspaceId returns null rather than a wrong contentId", () => {
    const id = getRightsAssessmentId("workspace-1", "tt-cc-3001");
    assert.equal(getContentIdFromRightsAssessmentId("workspace-2", id), null);
  });

  test("decoding a string that isn't one of this format's ids returns null", () => {
    assert.equal(getContentIdFromRightsAssessmentId("workspace-1", "not-a-real-id"), null);
  });
});
