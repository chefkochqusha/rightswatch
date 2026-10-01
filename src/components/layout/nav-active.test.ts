import { test } from "node:test";
import assert from "node:assert/strict";
import { isActive } from "./nav-active";

test("the workspace root is active only on itself, never as a prefix", () => {
  const overview = { href: "/workspace", label: "Overview" };
  assert.equal(isActive(overview, "/workspace"), true);
  assert.equal(isActive(overview, "/workspace/team"), false);
});

test("a section is active on its own path and anything below it", () => {
  const team = { href: "/workspace/team", label: "Team" };
  assert.equal(isActive(team, "/workspace/team"), true);
  assert.equal(isActive(team, "/workspace/team/invite"), true);
  // A shared prefix that isn't a path segment boundary doesn't count.
  assert.equal(isActive(team, "/workspace/teammates"), false);
});

test("alsoActiveFor claims a detail page for the section it belongs to", () => {
  const overview = { href: "/workspace", label: "Overview", alsoActiveFor: ["/workspace/items"] };
  assert.equal(isActive(overview, "/workspace/items/tt-cc-1001"), true);
  assert.equal(isActive(overview, "/workspace/billing"), false);
});
