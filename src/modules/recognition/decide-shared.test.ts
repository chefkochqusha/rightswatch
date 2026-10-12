import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_THRESHOLDS, decideRecognition } from "./decide";
import type { RecognitionMatchResult } from "./types";

/**
 * The same cases `services/recognizer/test_recognizer.py` runs against the
 * Python copy of the rule (`decide.py`, used by the real-music test), so the
 * two can't drift apart.
 */
const file = path.join(process.cwd(), "services", "recognizer", "decide_cases.json");
const { cases } = JSON.parse(readFileSync(file, "utf8")) as {
  cases: { name: string; thresholds?: Partial<typeof DEFAULT_THRESHOLDS>; result: { windows: number; candidates: Record<string, unknown>[] }; outcome: string }[];
};

describe("decision rule, shared cases with the Python copy", () => {
  for (const c of cases) {
    it(c.name, () => {
      const result = {
        algorithm: "bekvor-lp-2",
        durationSec: 30,
        windows: c.result.windows,
        candidates: c.result.candidates.map((candidate) => ({ speed: 1, pitchSemitones: 0, songOffsetSec: 0, ...candidate })),
      } as unknown as RecognitionMatchResult;
      assert.equal(decideRecognition(result, { ...DEFAULT_THRESHOLDS, ...c.thresholds }).outcome, c.outcome);
    });
  }
});
