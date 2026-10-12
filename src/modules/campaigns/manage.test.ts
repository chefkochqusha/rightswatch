import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryCampaignDirectory } from "./in-memory-directory";
import { createCampaign, deleteCampaign, renameCampaign, setCreatorOnCampaign } from "./manage";

function setup() {
  const campaigns = new InMemoryCampaignDirectory(new Map([["creator-a", "ws-1"], ["creator-b", "ws-1"], ["creator-x", "ws-2"]]));
  const records: { workspaceId: string; trackId: string; campaignIds: string[] }[] = [];
  const deps = {
    campaigns,
    rightsRecords: async (workspaceId: string) => records.filter((r) => r.workspaceId === workspaceId),
  };
  return { campaigns, records, deps };
}

describe("campaigns", () => {
  test("creates a campaign with a tidied name, and refuses a second one with the same name", async () => {
    const { deps } = setup();
    const first = await createCampaign({ workspaceId: "ws-1", name: "  Summer   Launch " }, deps);
    assert.ok(first.ok);
    if (first.ok) assert.equal(first.campaign.name, "Summer Launch");
    assert.deepEqual(await createCampaign({ workspaceId: "ws-1", name: "summer launch" }, deps), { ok: false, error: "NAME_TAKEN" });
    // Another workspace may use the same name.
    assert.equal((await createCampaign({ workspaceId: "ws-2", name: "Summer Launch" }, deps)).ok, true);
  });

  test("refuses an empty or overlong name", async () => {
    const { deps } = setup();
    assert.deepEqual(await createCampaign({ workspaceId: "ws-1", name: "   " }, deps), { ok: false, error: "NAME_REQUIRED" });
    assert.deepEqual(await createCampaign({ workspaceId: "ws-1", name: "x".repeat(81) }, deps), { ok: false, error: "NAME_TOO_LONG" });
  });

  test("renames, but not to another campaign's name and not across workspaces", async () => {
    const { deps } = setup();
    const a = await createCampaign({ workspaceId: "ws-1", name: "A" }, deps);
    await createCampaign({ workspaceId: "ws-1", name: "B" }, deps);
    assert.ok(a.ok);
    if (!a.ok) return;
    assert.deepEqual(await renameCampaign({ workspaceId: "ws-1", campaignId: a.campaign.id, name: "b" }, deps), { ok: false, error: "NAME_TAKEN" });
    assert.deepEqual(await renameCampaign({ workspaceId: "ws-2", campaignId: a.campaign.id, name: "C" }, deps), { ok: false, error: "NOT_FOUND" });
    assert.deepEqual(await renameCampaign({ workspaceId: "ws-1", campaignId: a.campaign.id, name: "a" }, deps), { ok: true, previousName: "A", name: "a" });
  });

  test("a campaign a rights record is limited to can't be deleted, so no licence silently grows", async () => {
    const { deps, records } = setup();
    const a = await createCampaign({ workspaceId: "ws-1", name: "A" }, deps);
    assert.ok(a.ok);
    if (!a.ok) return;
    records.push({ workspaceId: "ws-1", trackId: "song-1", campaignIds: [a.campaign.id] });
    records.push({ workspaceId: "ws-1", trackId: "song-2", campaignIds: [a.campaign.id, "other"] });
    assert.deepEqual(await deleteCampaign({ workspaceId: "ws-1", campaignId: a.campaign.id }, deps), { ok: false, error: "IN_USE", detail: 2 });

    records.length = 0;
    assert.deepEqual(await deleteCampaign({ workspaceId: "ws-2", campaignId: a.campaign.id }, deps), { ok: false, error: "NOT_FOUND" });
    assert.deepEqual(await deleteCampaign({ workspaceId: "ws-1", campaignId: a.campaign.id }, deps), { ok: true, name: "A" });
    assert.equal((await deps.campaigns.findForWorkspace("ws-1")).length, 0);
  });

  test("putting a creator on or off a campaign names the songs to re-assess", async () => {
    const { deps, records } = setup();
    const a = await createCampaign({ workspaceId: "ws-1", name: "A" }, deps);
    assert.ok(a.ok);
    if (!a.ok) return;
    records.push({ workspaceId: "ws-1", trackId: "song-1", campaignIds: [a.campaign.id] });
    records.push({ workspaceId: "ws-1", trackId: "song-1", campaignIds: [] });
    records.push({ workspaceId: "ws-1", trackId: "song-2", campaignIds: [] });

    const on = await setCreatorOnCampaign({ workspaceId: "ws-1", campaignId: a.campaign.id, creatorId: "creator-a", on: true }, deps);
    assert.deepEqual(on, { ok: true, name: "A", changed: true, reassess: ["song-1"] });
    assert.deepEqual((await deps.campaigns.findForCreatorId("ws-1", "creator-a")).map((c) => c.name), ["A"]);

    const again = await setCreatorOnCampaign({ workspaceId: "ws-1", campaignId: a.campaign.id, creatorId: "creator-a", on: true }, deps);
    assert.deepEqual(again, { ok: true, name: "A", changed: false, reassess: [] });

    const off = await setCreatorOnCampaign({ workspaceId: "ws-1", campaignId: a.campaign.id, creatorId: "creator-a", on: false }, deps);
    assert.equal(off.ok && off.changed, true);
    assert.equal((await deps.campaigns.findForCreatorId("ws-1", "creator-a")).length, 0);
  });

  test("another workspace's creator can't be put on a campaign", async () => {
    const { deps } = setup();
    const a = await createCampaign({ workspaceId: "ws-1", name: "A" }, deps);
    assert.ok(a.ok);
    if (!a.ok) return;
    assert.deepEqual(
      await setCreatorOnCampaign({ workspaceId: "ws-1", campaignId: a.campaign.id, creatorId: "creator-x", on: true }, deps),
      { ok: false, error: "NOT_FOUND" },
    );
  });
});
