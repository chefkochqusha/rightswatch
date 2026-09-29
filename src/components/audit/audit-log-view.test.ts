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

const noContext = { workspaceId: "workspace-1", currentUserId: "user-1" };

describe("buildAuditLogView", () => {
  test("case.opened reads as a plain 'Opened a case' entry, linked to its case", () => {
    const members = new Map([["user-1", makeUser("user-1", "Priya Shah", "priya@example.com")]]);
    const casesById = new Map([["case-1", makeCase("case-1", "workspace-1::tt-cc-3001")]]);
    const [view] = buildAuditLogView([makeEntry({})], {
      ...noContext,
      currentUserId: "someone-else",
      members,
      casesById,
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

  test("preserves input order (callers pass entries already sorted newest-first)", () => {
    const views = buildAuditLogView(
      [makeEntry({ id: "a" }), makeEntry({ id: "b" }), makeEntry({ id: "c" })],
      { ...noContext, members: new Map(), casesById: new Map() },
    );
    assert.deepEqual(views.map((v) => v.id), ["a", "b", "c"]);
  });
});
