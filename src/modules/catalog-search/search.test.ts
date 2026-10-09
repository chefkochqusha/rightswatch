import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DemoSongSearch } from "./demo";
import { MusicBrainzSongSearch, escapeLucene, toResults } from "./musicbrainz";

// The shape MusicBrainz's recording search returns (`fmt=json`), trimmed to
// the fields read — two releases of one song, an alternate version, and a
// video, which is left out.
const RECORDINGS = [
  {
    id: "rec-1",
    title: "Blinding Lights",
    length: 200040,
    video: null,
    "artist-credit": [{ name: "The Weeknd", joinphrase: "" }],
    "first-release-date": "2019-11-29",
    releases: [
      { id: "rel-compilation", title: "Now Hits 2020", date: "2020-06-01", status: "Official", "release-group": { "primary-type": "Album", "secondary-types": ["Compilation"] } },
      { id: "rel-album", title: "After Hours", date: "2020-03-20", status: "Official", "release-group": { "primary-type": "Album" } },
      { id: "rel-single", title: "Blinding Lights", date: "2019-11-29", status: "Official", "release-group": { "primary-type": "Single" } },
    ],
    isrcs: ["USUG11904206"],
  },
  {
    id: "rec-2",
    title: "Blinding Lights",
    length: 201000,
    "artist-credit": [{ name: "The Weeknd" }],
    releases: [{ id: "rel-2", title: "Blinding Lights", status: "Official", "release-group": { "primary-type": "Single" } }],
    isrcs: ["USUG11904206"],
  },
  {
    id: "rec-3",
    title: "Blinding Lights",
    "artist-credit": [{ name: "The Weeknd", joinphrase: " & " }, { name: "Rosalía" }],
    releases: [],
    isrcs: [],
  },
  { id: "rec-video", title: "Blinding Lights (Official Video)", video: true, "artist-credit": [{ name: "The Weeknd" }] },
];

describe("MusicBrainz results", () => {
  test("one line per song, the release a person would name it by, cover art by release", () => {
    const results = toResults(RECORDINGS);
    assert.equal(results.length, 2, "same song/artist/ISRC collapsed, video dropped");

    const [first, duet] = results;
    assert.equal(first.externalId, "rec-1");
    assert.equal(first.artist, "The Weeknd");
    assert.equal(first.isrc, "USUG11904206");
    assert.equal(first.album, "Blinding Lights", "the earliest official single/album, not the compilation");
    assert.equal(first.releaseDate, "2019-11-29");
    assert.equal(first.durationMs, 200040);
    assert.equal(first.artworkUrl, "https://coverartarchive.org/release/rel-single/front-250");

    assert.equal(duet.artist, "The Weeknd & Rosalía");
    assert.equal(duet.isrc, null);
    assert.equal(duet.artworkUrl, null);
  });

  test("Lucene operators in free text are escaped", () => {
    assert.equal(escapeLucene("AC/DC"), "AC\\/DC");
    assert.equal(escapeLucene("Don't Stop (Remix)"), "Don't Stop \\(Remix\\)");
  });

  test("the request names the app, searches ISRCs as ISRCs, and reports a busy service", async () => {
    const calls: { url: string; userAgent: string | null }[] = [];
    const ok = new MusicBrainzSongSearch({
      fetch: async (url, init) => {
        calls.push({ url: String(url), userAgent: new Headers(init?.headers).get("User-Agent") });
        return new Response(JSON.stringify({ recordings: RECORDINGS }), { status: 200 });
      },
    });
    const response = await ok.search("usug11904206");
    assert.equal(response.error, null);
    assert.equal(response.results.length, 2);
    assert.match(calls[0].url, /query=isrc%3AUSUG11904206/);
    assert.match(calls[0].userAgent ?? "", /^Bekvor\/[\d.]+ \( https:\/\//);

    const busy = new MusicBrainzSongSearch({ fetch: async () => new Response("", { status: 503 }) });
    const busyResponse = await busy.search("blinding lights");
    assert.deepEqual(busyResponse.results, []);
    assert.match(busyResponse.error ?? "", /busy/);

    const down = new MusicBrainzSongSearch({
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    assert.match((await down.search("blinding lights")).error ?? "", /isn't reachable/);
  });

  test("too-short queries don't search", async () => {
    let called = false;
    const provider = new MusicBrainzSongSearch({
      fetch: async () => {
        called = true;
        return new Response("{}");
      },
    });
    assert.deepEqual(await provider.search(" a "), { results: [], error: null });
    assert.equal(called, false);
  });
});

describe("DemoSongSearch", () => {
  test("finds the Brief's demo songs by title, artist or ISRC", async () => {
    const search = new DemoSongSearch();
    assert.equal((await search.search("midnight run")).results[0]?.title, "Midnight Run");
    const byArtist = (await search.search("riva")).results.map((song) => song.title);
    assert.ok(byArtist.includes("Golden Hour") && byArtist.includes("Coastline"));
    assert.equal((await search.search("DEMO-126-00003")).results[0]?.title, "Signals");
    assert.deepEqual((await search.search("no such song")).results, []);
  });
});
