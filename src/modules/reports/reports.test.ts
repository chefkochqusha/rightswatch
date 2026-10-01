import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "./csv";
import { DETECTION_COLUMNS, detectionRows, itemsInPeriod, summarize, type DetectionLookups } from "./detections-report";
import type { StoredScanItem } from "../scan-results";
import type { CaseRecord } from "../cases";

describe("csv", () => {
  test("quotes commas, quotes and line breaks", () => {
    assert.equal(csvCell("a,b"), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell("one\ntwo"), '"one\ntwo"');
    assert.equal(csvCell("plain"), "plain");
  });

  test("empty and numeric cells", () => {
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(undefined), "");
    assert.equal(csvCell(94.1), "94.1");
  });

  test("a cell that would run as a formula is made plain text", () => {
    for (const bad of ["=HYPERLINK(\"x\")", "+1", "-2+3", "@SUM(A1)", "\tcmd"]) {
      assert.ok(csvCell(bad).replace(/^"/, "").startsWith("'"), bad);
    }
    assert.equal(csvCell("@maxstudio"), "'@maxstudio");
  });

  test("starts with a byte-order mark and ends rows with CRLF", () => {
    const csv = toCsv([["a", "b"], ["1", "2"]]);
    assert.equal(csv, "﻿a,b\r\n1,2\r\n");
  });
});

const day = (n: number) => new Date(Date.UTC(2026, 8, n));
function item(partial: Record<string, unknown>): StoredScanItem {
  return partial as unknown as StoredScanItem;
}
const content = (externalContentId: string, publishedAt: Date, brands = ["Volt Coffee"]) => ({
  externalContentId,
  publishedAt,
  brandNames: brands,
  label: "Paid partnership",
  videoUrls: [`https://example.test/${externalContentId}`],
});
const match = (trackId: string, title: string) => ({ trackId, title, artist: "Riva", isrc: "DEMO1", confidence: 0.941 });

const items: StoredScanItem[] = [
  item({ kind: "ASSESSED", creatorId: "c1", creatorUsername: "maxstudio", rightsAssessmentId: "ra1", content: content("p1", day(10)), musicMatch: match("t1", "Golden Hour"), assessment: { status: "POTENTIAL_MISMATCH", reason: "TERM_EXPIRED", explanation: "Term ended." } }),
  item({ kind: "ASSESSED", creatorId: "c2", creatorUsername: "lena.creates", rightsAssessmentId: "ra2", content: content("p2", day(20)), musicMatch: match("t2", "Midnight Run"), assessment: { status: "CLEARED", reason: null, explanation: "Covered." } }),
  item({ kind: "OTHER_MUSIC", creatorId: "c1", creatorUsername: "maxstudio", rightsAssessmentId: null, content: content("p3", day(25)), musicMatch: match("t9", "Unlisted") }),
  item({ kind: "NO_MUSIC_MATCH", creatorId: "c3", creatorUsername: "danbuilds", rightsAssessmentId: null, content: content("p4", day(26)) }),
];

const lookups: DetectionLookups = {
  caseByAssessment: new Map<string, CaseRecord>([
    ["ra1", { id: "case1", workspaceId: "w", rightsAssessmentId: "ra1", status: "WAITING", priority: "HIGH", assignedToId: "u1", createdAt: day(11), updatedAt: day(12) }],
  ]),
  memberName: new Map([["u1", "Nina Schneider"]]),
  statusLabel: (s) => s,
  reasonLabel: (r) => r,
  caseStatusLabel: (s) => s,
  casePriorityLabel: (p) => p,
};

describe("detections report", () => {
  test("one row per post with a song, header first, in the app's columns", () => {
    const rows = detectionRows(items, lookups);
    assert.deepEqual(rows[0], [...DETECTION_COLUMNS]);
    assert.equal(rows.length, 4); // header + 3 posts with a song
    const first = rows[1];
    assert.equal(first[0], "2026-09-10");
    assert.equal(first[1], "maxstudio");
    assert.equal(first[7], 94.1);
    assert.equal(first[11], "WAITING");
    assert.equal(first[13], "Nina Schneider");
  });

  test("demo posts carry no made-up link", () => {
    const real = detectionRows(items, lookups)[1][14];
    const demo = detectionRows(items, { ...lookups, isDemo: true })[1][14];
    assert.match(String(real), /^https:/);
    assert.equal(demo, "Demo data: not a real post");
  });

  test("a song outside the catalogue is listed as not checked", () => {
    const rows = detectionRows(items, lookups);
    assert.match(String(rows[3][8]), /Not checked/);
    assert.equal(rows[3][11], "");
  });

  test("periods cut by publication date", () => {
    const now = day(28);
    assert.equal(itemsInPeriod(items, "30d", now).length, 4);
    assert.equal(itemsInPeriod(items, "30d", new Date(Date.UTC(2026, 10, 1))).length, 0);
    assert.equal(itemsInPeriod(items, "all", new Date(Date.UTC(2030, 0, 1))).length, 4);
  });

  test("summary counts verdicts, songs and creators", () => {
    const s = summarize(items);
    assert.equal(s.postsChecked, 4);
    assert.equal(s.withMusic, 3);
    assert.equal(s.verdicts.POTENTIAL_MISMATCH, 1);
    assert.equal(s.verdicts.CLEARED, 1);
    assert.equal(s.notInCatalogue, 1);
    assert.equal(s.bySong[0].title, "Golden Hour");
    assert.equal(s.byCreator[0].username, "maxstudio");
    assert.equal(s.byCreator[0].toReview, 1);
  });
});
