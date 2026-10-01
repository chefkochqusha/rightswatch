import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseRightsRecordForm, toFormDay, toRightsRecordInput, type RightsRecordForm } from "./library";
import { InMemoryRightsRecordRepository } from "./in-memory-repository";

const FORM: RightsRecordForm = {
  commercial: false,
  organic: true,
  territoryScope: "listed",
  territories: "de, AT ch",
  startDate: "2026-01-01",
  endDate: "2026-09-22",
  campaignScope: "all",
  campaignIds: [],
  notes: "  Sync licence  ",
  source: "",
};

describe("parseRightsRecordForm", () => {
  test("Brief §10's own example record: DE/AT/CH, organic only, a fixed term", () => {
    const result = parseRightsRecordForm(FORM, []);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.values.territories, ["DE", "AT", "CH"]);
    assert.equal(result.values.commercial, false);
    assert.equal(result.values.startDate.toISOString(), "2026-01-01T00:00:00.000Z");
    assert.equal(result.values.endDate?.toISOString(), "2026-09-22T23:59:59.999Z", "the end date is covered in full");
    assert.equal(result.values.notes, "Sync licence");
    assert.equal(result.values.source, null);
    assert.equal(toFormDay(result.values.endDate), "2026-09-22");
  });

  test("worldwide and open-ended are empty lists and a null end", () => {
    const result = parseRightsRecordForm({ ...FORM, territoryScope: "worldwide", territories: "XX", endDate: "" }, []);
    assert.ok(result.ok);
    if (result.ok) {
      assert.deepEqual(result.values.territories, [], "codes typed before switching to worldwide don't count");
      assert.equal(result.values.endDate, null);
    }
  });

  test("says what's wrong with each field", () => {
    const result = parseRightsRecordForm(
      {
        ...FORM,
        commercial: false,
        organic: false,
        territories: "DE, XX",
        startDate: "2026-02-30",
        endDate: "2025-01-01",
        campaignScope: "listed",
        campaignIds: [],
      },
      ["c1"],
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.errors.usage ?? "", /at least one/);
    assert.match(result.errors.territories ?? "", /“XX” isn't a country code/);
    assert.match(result.errors.startDate ?? "", /real date/);
    assert.match(result.errors.campaigns ?? "", /Choose the campaigns/);

    const backwards = parseRightsRecordForm({ ...FORM, startDate: "2026-05-01", endDate: "2026-04-30" }, []);
    assert.equal(!backwards.ok && backwards.errors.endDate, "The end date can't be before the start date.");
  });

  test("a campaign scope must name this workspace's campaigns", () => {
    const scoped = { ...FORM, campaignScope: "listed", campaignIds: ["c1", "c1"] };
    const ok = parseRightsRecordForm(scoped, ["c1", "c2"]);
    assert.deepEqual(ok.ok && ok.values.campaignIds, ["c1"]);
    const foreign = parseRightsRecordForm({ ...scoped, campaignIds: ["elsewhere"] }, ["c1"]);
    assert.match(!foreign.ok ? (foreign.errors.campaigns ?? "") : "", /this workspace/);
  });
});

describe("InMemoryRightsRecordRepository", () => {
  test("records are per workspace and song, and map to the Rights Engine's input", async () => {
    const repo = new InMemoryRightsRecordRepository();
    const parsed = parseRightsRecordForm(FORM, []);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const row = await repo.create({ ...parsed.values, workspaceId: "w1", trackId: "t1" });

    assert.deepEqual((await repo.findForTrack("w1", "t1")).map((r) => r.id), [row.id]);
    assert.deepEqual(await repo.findForTrack("w2", "t1"), []);
    assert.equal(await repo.findById("w2", row.id), null);

    const input = toRightsRecordInput(row);
    assert.equal(input.commercialUsageAllowed, false);
    assert.equal(input.organicUsageAllowed, true);
    assert.deepEqual(input.territories, ["DE", "AT", "CH"]);

    await repo.delete(row.id);
    assert.deepEqual(await repo.findForTrack("w1", "t1"), []);
  });
});
