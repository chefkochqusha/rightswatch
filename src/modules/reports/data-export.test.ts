import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { exportFileName, exportNotes, parseExportScope, rowsToRecords } from "./data-export";

describe("rowsToRecords", () => {
  test("keys each row by the header", () => {
    assert.deepEqual(
      rowsToRecords([
        ["Date", "Creator", "Confidence"],
        ["2026-09-01", "lena", 0.9],
        ["2026-09-02", "max", null],
      ]),
      [
        { Date: "2026-09-01", Creator: "lena", Confidence: 0.9 },
        { Date: "2026-09-02", Creator: "max", Confidence: null },
      ],
    );
  });

  test("a short row fills the missing columns with null, no rows gives an empty list", () => {
    assert.deepEqual(rowsToRecords([["a", "b"], ["x"]]), [{ a: "x", b: null }]);
    assert.deepEqual(rowsToRecords([["a", "b"]]), []);
    assert.deepEqual(rowsToRecords([]), []);
  });
});

describe("exportFileName", () => {
  test("names the scope, workspace and day, and keeps odd characters out of the file name", () => {
    assert.equal(exportFileName("workspace", "northstar-music", new Date("2026-10-05T20:00:00Z")), "bekvor-workspace-data-northstar-music-2026-10-05.json");
    assert.equal(exportFileName("account", '../"evil"', new Date("2026-10-05T00:00:00Z")), "bekvor-account-data-evil-2026-10-05.json");
    assert.equal(exportFileName("account", "///", new Date("2026-10-05T00:00:00Z")), "bekvor-account-data-workspace-2026-10-05.json");
  });
});

describe("parseExportScope / exportNotes", () => {
  test("anything but 'account' means the whole workspace", () => {
    assert.equal(parseExportScope("account"), "account");
    assert.equal(parseExportScope("workspace"), "workspace");
    assert.equal(parseExportScope(undefined), "workspace");
    assert.equal(parseExportScope("everything"), "workspace");
  });

  test("both notes say password hashes are never in the file", () => {
    for (const scope of ["workspace", "account"] as const) {
      assert.ok(exportNotes(scope).some((line) => /password hash/i.test(line)));
    }
  });
});
