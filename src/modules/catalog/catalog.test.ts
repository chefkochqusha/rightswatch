import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { InMemoryCatalogRepository } from "./in-memory-repository";
import { addSong, recordIdentifiedTrack, removeSong, updateSongDetails } from "./catalog";

function setup() {
  const catalogRepository = new InMemoryCatalogRepository();
  return { catalogRepository, deps: { catalogRepository } };
}

describe("addSong", () => {
  test("adds a searched song to the catalogue with what the search knew", async () => {
    const { deps, catalogRepository } = setup();
    const result = await addSong(
      {
        workspaceId: "w1",
        title: " Blinding Lights ",
        artist: "The Weeknd",
        isrc: "usug11904206",
        album: "After Hours",
        durationMs: 200_040,
        source: "musicbrainz",
        externalId: "mbid-1",
        artworkUrl: "https://coverartarchive.org/release/r1/front-250",
      },
      deps,
    );
    assert.ok(result.ok);
    assert.equal(result.wasIdentified, false);
    assert.equal(result.track.title, "Blinding Lights");
    assert.equal(result.track.isrc, "USUG11904206");
    assert.equal(result.track.inCatalogue, true);
    assert.ok(result.track.addedAt);
    assert.equal((await catalogRepository.findCatalogue("w1")).length, 1);
  });

  test("refuses a song already in the catalogue, recognised by ISRC or by name", async () => {
    const { deps } = setup();
    await addSong({ workspaceId: "w1", title: "Midnight Run", artist: "Aiko", isrc: "DEMO12600001", source: "demo" }, deps);
    const byIsrc = await addSong({ workspaceId: "w1", title: "Midnight Run (Edit)", isrc: "DEMO-126-00001", source: "manual" }, deps);
    assert.equal(!byIsrc.ok && byIsrc.error, "ALREADY_IN_CATALOGUE");
    const byName = await addSong({ workspaceId: "w1", title: "midnight run", artist: "AIKO", source: "manual" }, deps);
    assert.equal(!byName.ok && byName.error, "ALREADY_IN_CATALOGUE");
    const otherWorkspace = await addSong({ workspaceId: "w2", title: "Midnight Run", artist: "Aiko", source: "manual" }, deps);
    assert.ok(otherWorkspace.ok);
  });

  test("validates the title and ISRC", async () => {
    const { deps } = setup();
    assert.deepEqual(await addSong({ workspaceId: "w1", title: "  ", source: "manual" }, deps), { ok: false, error: "TITLE_REQUIRED" });
    assert.deepEqual(await addSong({ workspaceId: "w1", title: "Song", isrc: "nope", source: "manual" }, deps), {
      ok: false,
      error: "ISRC_INVALID",
    });
  });

  test("a song a scan already identified joins the catalogue as the same record", async () => {
    const { deps } = setup();
    const identified = await recordIdentifiedTrack(
      { workspaceId: "w1", title: "City Lights", artist: "Demo Artist", isrc: "DEMO12600006" },
      deps,
    );
    assert.equal(identified.inCatalogue, false);
    assert.equal(identified.source, "identified");

    const added = await addSong({ workspaceId: "w1", title: "City Lights", artist: "Demo Artist", source: "demo", album: "Demo" }, deps);
    assert.ok(added.ok);
    assert.equal(added.track.id, identified.id);
    assert.equal(added.wasIdentified, true);
    assert.equal(added.track.inCatalogue, true);
    assert.equal(added.track.source, "demo");
    assert.equal(added.track.album, "Demo");
  });
});

describe("removeSong and updateSongDetails", () => {
  test("remove takes the song out of the catalogue but keeps the record", async () => {
    const { deps, catalogRepository } = setup();
    const added = await addSong({ workspaceId: "w1", title: "Signals", artist: "Kova", source: "manual" }, deps);
    assert.ok(added.ok);
    const removed = await removeSong({ workspaceId: "w1", trackId: added.track.id }, deps);
    assert.ok(removed.ok);
    assert.equal(removed.track.inCatalogue, false);
    assert.deepEqual(await catalogRepository.findCatalogue("w1"), []);
    assert.equal((await catalogRepository.findAllKnown("w1")).length, 1);
    assert.deepEqual(await removeSong({ workspaceId: "w1", trackId: added.track.id }, deps), { ok: false, error: "NOT_FOUND" });

    const back = await addSong({ workspaceId: "w1", title: "Signals", artist: "Kova", source: "manual" }, deps);
    assert.ok(back.ok);
    assert.equal(back.track.id, added.track.id);
  });

  test("details are trimmed, cleared when empty, and scoped by workspace", async () => {
    const { deps } = setup();
    const added = await addSong({ workspaceId: "w1", title: "Afterglow", artist: "Mira", source: "manual" }, deps);
    assert.ok(added.ok);
    const updated = await updateSongDetails(
      { workspaceId: "w1", trackId: added.track.id, publisher: " Northstar Music Publishing ", label: "", notes: "Sync deal 2026" },
      deps,
    );
    assert.ok(updated.ok);
    assert.equal(updated.track.publisher, "Northstar Music Publishing");
    assert.equal(updated.track.label, null);
    assert.deepEqual(await updateSongDetails({ workspaceId: "w2", trackId: added.track.id, notes: "x" }, deps), {
      ok: false,
      error: "NOT_FOUND",
    });
  });
});
