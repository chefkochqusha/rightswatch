import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildAuditLogView } from "./audit-log-view";
import type { AuditLogRecord } from "@/modules/audit";
import type { UserRecord } from "@/modules/auth";
import type { CaseRecord } from "@/modules/cases";

function makeUser(id: string, name: string | null, email: string): UserRecord {
  return { id, name, email, passwordHash: "hash", createdAt: new Date(), updatedAt: new Date() };
}

function makeCase(id: string, rightsAssessmentId: string): CaseRecord {
  return {
    id,
    workspaceId: "workspace-1",
    rightsAssessmentId,
    status: "OPEN",
    assignedToId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeEntry(overrides: Partial<AuditLogRecord>): AuditLogRecord {
  return {
    id: "entry-1",
    workspaceId: "workspace-1",
    actorId: "user-1",
    action: "case.opened",
    targetType: "case",
    targetId: "case-1",
    metadata: null,
    createdAt: new Date("2026-01-01T12:00:00Z"),
    ...overrides,
  };
}

const noContext = { currentUserId: "user-1", contentIdByRightsAssessmentId: new Map<string, string>() };

describe("buildAuditLogView", () => {
  test("case.opened reads as a plain 'Opened a case' entry, linked to its case", () => {
    const members = new Map([["user-1", makeUser("user-1", "Priya Shah", "priya@example.com")]]);
    const casesById = new Map([["case-1", makeCase("case-1", "assessment-1")]]);
    const [view] = buildAuditLogView([makeEntry({})], {
      ...noContext,
      currentUserId: "someone-else",
      members,
      casesById,
      contentIdByRightsAssessmentId: new Map([["assessment-1", "tt-cc-3001"]]),
    });
    assert.equal(view.actorLabel, "Priya Shah");
    assert.equal(view.description, "Opened a case");
    assert.equal(view.href, "/workspace/items/tt-cc-3001");
  });

  test("the current user's own actions are attributed to 'You'", () => {
    const members = new Map([["user-1", makeUser("user-1", "Priya Shah", "priya@example.com")]]);
    const [view] = buildAuditLogView([makeEntry({})], {
      ...noContext,
      members,
      casesById: new Map(),
    });
    assert.equal(view.actorLabel, "You");
  });

  test("a null actor reads as System", () => {
    const [view] = buildAuditLogView([makeEntry({ actorId: null })], {
      ...noContext,
      members: new Map(),
      casesById: new Map(),
    });
    assert.equal(view.actorLabel, "System");
  });

  test("an actor id with no matching member degrades instead of showing nothing", () => {
    const [view] = buildAuditLogView([makeEntry({ actorId: "gone" })], {
      ...noContext,
      members: new Map(),
      casesById: new Map(),
    });
    assert.equal(view.actorLabel, "A former teammate");
  });

  test("case.status_changed describes both sides with UI labels, not raw enum values", () => {
    const [view] = buildAuditLogView(
      [makeEntry({ action: "case.status_changed", metadata: { from: "OPEN", to: "RESOLVED" } })],
      { ...noContext, members: new Map(), casesById: new Map() },
    );
    assert.equal(view.description, "Changed the case status from Open to Resolved");
  });

  test("case.assignee_changed resolves from/to user ids through the member map", () => {
    const members = new Map([["user-2", makeUser("user-2", "Leon Ward", "leon@example.com")]]);
    const [view] = buildAuditLogView(
      [makeEntry({ action: "case.assignee_changed", metadata: { from: null, to: "user-2" } })],
      { ...noContext, members, casesById: new Map() },
    );
    assert.equal(view.description, "Changed the case assignment from Unassigned to Leon Ward");
  });

  test("case.assignee_changed names the current user 'You' on either side", () => {
    const [view] = buildAuditLogView(
      [makeEntry({ action: "case.assignee_changed", metadata: { from: "user-1", to: null } })],
      { ...noContext, members: new Map(), casesById: new Map() },
    );
    assert.equal(view.description, "Changed the case assignment from You to Unassigned");
  });

  test("a case target that can't be found degrades to no link rather than throwing", () => {
    const [view] = buildAuditLogView([makeEntry({ targetId: "missing-case" })], {
      ...noContext,
      members: new Map(),
      casesById: new Map(),
    });
    assert.equal(view.href, null);
  });

  test("an unrecognized targetType never gets a case link", () => {
    const [view] = buildAuditLogView(
      [makeEntry({ targetType: "invite", targetId: "invite-1" })],
      { ...noContext, members: new Map(), casesById: new Map([["invite-1", makeCase("invite-1", "x")]]) },
    );
    assert.equal(view.href, null);
  });

  test("an unrecognized action string still renders, using the raw string as its own label", () => {
    const [view] = buildAuditLogView(
      [makeEntry({ action: "invite.sent", targetType: "invite", targetId: "invite-1" })],
      { ...noContext, members: new Map(), casesById: new Map() },
    );
    assert.equal(view.description, "invite.sent");
  });

  test("creator entries name the creator and link to its page", () => {
    const [added, removed, unnamed] = buildAuditLogView(
      [
        makeEntry({ action: "creator.added", targetType: "creator", targetId: "creator-1", metadata: { handle: "lena.creates" } }),
        makeEntry({ action: "creator.removed", targetType: "creator", targetId: "creator-1", metadata: { handle: "lena.creates" } }),
        makeEntry({ action: "creator.paused", targetType: "creator", targetId: "creator-2", metadata: null }),
      ],
      { ...noContext, members: new Map(), casesById: new Map() },
    );
    assert.equal(added.description, "Added @lena.creates to the watchlist");
    assert.equal(added.href, "/workspace/creators/creator-1");
    assert.equal(removed.description, "Removed @lena.creates from the watchlist");
    assert.equal(unnamed.description, "Paused monitoring of a creator");
    assert.equal(added.hrefLabel, "View creator");
  });

  test("song and rights entries name the song and link to its page", () => {
    const [added, rights, untitled] = buildAuditLogView(
      [
        makeEntry({ action: "song.added", targetType: "song", targetId: "track-1", metadata: { title: "Midnight Run" } }),
        makeEntry({ action: "rights.updated", targetType: "song", targetId: "track-1", metadata: { title: "Midnight Run" } }),
        makeEntry({ action: "song.removed", targetType: "song", targetId: "track-2", metadata: null }),
      ],
      { ...noContext, members: new Map(), casesById: new Map() },
    );
    assert.equal(added.description, "Added “Midnight Run” to the catalogue");
    assert.equal(added.href, "/workspace/rights/track-1");
    assert.equal(added.hrefLabel, "View song");
    assert.equal(rights.description, "Changed a rights record on “Midnight Run”");
    assert.equal(untitled.description, "Took a song out of the catalogue");
  });

  test("preserves input order (callers pass entries already sorted newest-first)", () => {
    const views = buildAuditLogView(
      [makeEntry({ id: "a" }), makeEntry({ id: "b" }), makeEntry({ id: "c" })],
      { ...noContext, members: new Map(), casesById: new Map() },
    );
    assert.deepEqual(views.map((v) => v.id), ["a", "b", "c"]);
  });
});
