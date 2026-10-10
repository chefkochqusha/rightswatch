import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THRESHOLDS, decideRecognition, thresholdsFromEnv } from "./decide";
import { RecognitionServiceError, RecognizerClient, catalogueVersion } from "./client";
import { sniffMediaFormat } from "./media-type";
import type { RecognitionCandidate, RecognitionMatchResult } from "./types";

function result(top: Partial<RecognitionCandidate> | null, windows = 4): RecognitionMatchResult {
  return {
    algorithm: "bekvor-lp-1",
    durationSec: 30,
    windows,
    candidates: top
      ? [{ trackId: "t1", score: 500, nextScore: 50, windowsWon: windows, speed: 1, pitchSemitones: 0, songOffsetSec: 12, ...top }]
      : [],
  };
}

describe("decideRecognition", () => {
  it("identifies a song that clearly stands out and wins most of the post", () => {
    const d = decideRecognition(result({}));
    assert.equal(d.outcome, "MATCH");
    assert.equal(d.trackId, "t1");
    assert.equal(d.confidence, 0.9);
    assert.match(d.reason, /10\.0× the next/);
  });

  it("only suggests a song that is ahead but not by much", () => {
    const d = decideRecognition(result({ score: 200, nextScore: 100 }));
    assert.equal(d.outcome, "CANDIDATE");
    assert.equal(d.trackId, "t1");
    assert.match(d.reason, /Please confirm/);
  });

  it("only suggests a song that wins too few parts of the post", () => {
    const d = decideRecognition(result({ windowsWon: 1 }, 4));
    assert.equal(d.outcome, "CANDIDATE");
    assert.match(d.reason, /only 1 of 4 parts/);
  });

  it("finds nothing when no song stands out, the score is noise, or there are no candidates", () => {
    assert.equal(decideRecognition(result({ score: 180, nextScore: 160 })).outcome, "NO_MATCH");
    assert.equal(decideRecognition(result({ score: 40, nextScore: 1 })).outcome, "NO_MATCH");
    assert.equal(decideRecognition(result(null)).outcome, "NO_MATCH");
  });

  it("doesn't let a tiny next-best score inflate the ratio", () => {
    // 70 / max(2, 20) = 3.5: a match, but with modest strength
    const d = decideRecognition(result({ score: 70, nextScore: 2 }));
    assert.equal(d.outcome, "MATCH");
    assert.equal(d.confidence, 0.71);
  });

  it("says when the song was sped up or pitched", () => {
    assert.match(decideRecognition(result({ speed: 1.25, pitchSemitones: 4 })).reason, /sped up to 1\.25×, pitch \+4 semitones/);
  });

  it("reads thresholds from the environment, within sane bounds", () => {
    assert.deepEqual(thresholdsFromEnv({}), DEFAULT_THRESHOLDS);
    const t = thresholdsFromEnv({ RECOGNITION_MATCH_RATIO: "4", RECOGNITION_CANDIDATE_RATIO: "9", RECOGNITION_MIN_SCORE: "-1" });
    assert.equal(t.matchRatio, 4);
    assert.equal(t.candidateRatio, 4, "never above the match ratio");
    assert.equal(t.minScore, DEFAULT_THRESHOLDS.minScore);
  });
});

describe("catalogueVersion", () => {
  const a = { trackId: "a", fingerprintUpdatedAt: new Date("2026-10-01T00:00:00Z") };
  const b = { trackId: "b", fingerprintUpdatedAt: new Date("2026-10-02T00:00:00Z") };
  it("is the same for the same songs in any order, and changes with any change", () => {
    assert.equal(catalogueVersion([a, b]), catalogueVersion([b, a]));
    assert.notEqual(catalogueVersion([a, b]), catalogueVersion([a]));
    assert.notEqual(catalogueVersion([a, b]), catalogueVersion([a, { ...b, fingerprintUpdatedAt: new Date() }]));
  });
});

describe("sniffMediaFormat", () => {
  const bytes = (...parts: (string | number[])[]) =>
    Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
  it("recognises the usual audio and video containers by their first bytes", () => {
    assert.equal(sniffMediaFormat(bytes("ID3", [4, 0])), "mp3");
    assert.equal(sniffMediaFormat(bytes([0xff, 0xfb, 0x90])), "mp3");
    assert.equal(sniffMediaFormat(bytes([0xff, 0xf1, 0x50])), "aac");
    assert.equal(sniffMediaFormat(bytes("RIFF", [0, 0, 0, 0], "WAVE")), "wav");
    assert.equal(sniffMediaFormat(bytes("FORM", [0, 0, 0, 0], "AIFF")), "aiff");
    assert.equal(sniffMediaFormat(bytes("fLaC")), "flac");
    assert.equal(sniffMediaFormat(bytes("OggS")), "ogg");
    assert.equal(sniffMediaFormat(bytes([0, 0, 0, 0x20], "ftypisom")), "mp4");
    assert.equal(sniffMediaFormat(bytes([0x1a, 0x45, 0xdf, 0xa3])), "webm");
  });
  it("refuses anything else, whatever it's called", () => {
    assert.equal(sniffMediaFormat(bytes("%PDF-1.7")), null);
    assert.equal(sniffMediaFormat(bytes([0x4d, 0x5a])), null); // a Windows program
    assert.equal(sniffMediaFormat(bytes("RIFF", [0, 0, 0, 0], "AVI ")), null);
    assert.equal(sniffMediaFormat(new Uint8Array()), null);
  });
});

describe("RecognizerClient", () => {
  function stub(status: number, body: unknown) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    return { calls, client: new RecognizerClient({ baseUrl: "http://recognizer:8090/", token: "tok", fetchImpl }) };
  }

  it("sends the token and returns the match", async () => {
    const { calls, client } = stub(200, result({}));
    const r = await client.match("ws1", "v1", new Uint8Array([1, 2]));
    assert.equal(r?.candidates[0].trackId, "t1");
    assert.equal(calls[0].url, "http://recognizer:8090/match/ws1?version=v1");
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer tok");
  });

  it("returns null when the index needs loading", async () => {
    const { client } = stub(409, { error: "Index not loaded.", needIndex: true });
    assert.equal(await client.match("ws1", "v1", new Uint8Array([1])), null);
  });

  it("marks unreadable audio, so the job isn't retried", async () => {
    const { client } = stub(422, { error: "The file has no readable audio track." });
    await assert.rejects(client.fingerprint(new Uint8Array([1])), (e: RecognitionServiceError) => e.unreadableAudio && /no readable audio/.test(e.message));
  });

  it("reports other failures as retryable", async () => {
    const { client } = stub(500, { error: "boom" });
    await assert.rejects(client.fingerprint(new Uint8Array([1])), (e: RecognitionServiceError) => !e.unreadableAudio && /500: boom/.test(e.message));
  });

  it("reports an unreachable service", async () => {
    const client = new RecognizerClient({
      baseUrl: "http://recognizer:8090",
      token: "t",
      fetchImpl: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch,
    });
    await assert.rejects(client.health(), /can't be reached \(fetch failed\)/);
  });
});
