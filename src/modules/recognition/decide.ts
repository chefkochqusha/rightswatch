import type { RecognitionDecision, RecognitionMatchResult, RecognitionThresholds } from "./types";

/**
 * The defaults, from the calibration run (`services/recognizer/calibrate.py`:
 * 30 synthetic songs, 360 edited posts, 75 posts without a catalogue song;
 * see `services/recognizer/README.md`). There, 1 of the 75 reached MATCH (a
 * synthetic look-alike with the same chords and instruments) and 11 reached
 * CANDIDATE, while clean, compressed, phone-recorded and pitch-shifted posts
 * of catalogue songs were all found. Synthetic songs are much more alike than
 * real ones; re-measure with real music and change them with environment
 * variables. Results are suggestions a person confirms unless
 * `RECOGNITION_AUTO_IDENTIFY` is on.
 */
export const DEFAULT_THRESHOLDS: RecognitionThresholds = {
  matchRatio: 3,
  candidateRatio: 1.6,
  minScore: 60,
  minWindowShare: 0.5,
  ratioFloor: 20,
  // Melody check (`services/recognizer/README.md`): at 0.7 none of the
  // synthetic look-alikes that passed the landmark rule passed it, while
  // clean, compressed, time-stretched and pitched uses did; voice-overs often
  // don't, and stay suggestions.
  minMelodyAgreement: 0.7,
};

export function thresholdsFromEnv(env: Record<string, string | undefined> = process.env): RecognitionThresholds {
  const num = (raw: string | undefined, fallback: number, min: number) => {
    const value = Number(raw);
    return Number.isFinite(value) && value >= min ? value : fallback;
  };
  const matchRatio = num(env.RECOGNITION_MATCH_RATIO, DEFAULT_THRESHOLDS.matchRatio, 1.1);
  return {
    ...DEFAULT_THRESHOLDS,
    matchRatio,
    // a suggestion never needs more evidence than a match
    candidateRatio: Math.min(num(env.RECOGNITION_CANDIDATE_RATIO, DEFAULT_THRESHOLDS.candidateRatio, 1.05), matchRatio),
    minScore: num(env.RECOGNITION_MIN_SCORE, DEFAULT_THRESHOLDS.minScore, 0),
    minMelodyAgreement: Math.min(num(env.RECOGNITION_MIN_MELODY, DEFAULT_THRESHOLDS.minMelodyAgreement, 0), 1),
  };
}

/**
 * MATCH, CANDIDATE or NO_MATCH for a post, from the service's evidence.
 *
 * The rule errs towards a person: the song is only identified on its own
 * when it stands out clearly from every other catalogue song AND wins in at
 * least half of the post. Anything weaker that still stands out is a
 * suggestion for a person to confirm ("needs review"), never a verdict.
 */
export function decideRecognition(result: RecognitionMatchResult, t: RecognitionThresholds = DEFAULT_THRESHOLDS): RecognitionDecision {
  const top = result.candidates[0];
  if (!top || top.score < t.minScore) {
    return { outcome: "NO_MATCH", trackId: null, confidence: 0, reason: "None of your songs with reference audio was found in this post." };
  }
  const ratio = top.score / Math.max(top.nextScore, t.ratioFloor);
  const confidence = Math.max(0, Math.min(0.99, Math.round((1 - 1 / ratio) * 100) / 100));
  const windowShare = result.windows > 0 ? top.windowsWon / result.windows : 0;
  const edits = describeEdits(top.speed, top.pitchSemitones);

  const melody = top.melodyAgreement ?? null;
  const strongLandmarks = ratio >= t.matchRatio && windowShare >= t.minWindowShare;
  if (strongLandmarks && melody !== null && melody >= t.minMelodyAgreement) {
    return {
      outcome: "MATCH",
      trackId: top.trackId,
      confidence,
      reason: `Clearly ahead of every other song (${ratio.toFixed(1)}× the next), in ${top.windowsWon} of ${result.windows} parts of the post, and the melody agrees (${Math.round(melody * 100)} %)${edits}.`,
    };
  }
  if (strongLandmarks) {
    const why =
      melody === null
        ? "the melody couldn't be compared (upload the song's recording again to enable that check, or the post has too little melody)"
        : `but the melody agrees only ${Math.round(melody * 100)} % (a voice-over or a similar-sounding song can cause that)`;
    return { outcome: "CANDIDATE", trackId: top.trackId, confidence, reason: `Clearly ahead of every other song (${ratio.toFixed(1)}× the next), ${why}${edits}. Please confirm.` };
  }
  if (ratio >= t.candidateRatio) {
    const why =
      ratio < t.matchRatio
        ? `ahead of the next song, but not by much (${ratio.toFixed(1)}×)`
        : `found in only ${top.windowsWon} of ${result.windows} parts of the post`;
    return { outcome: "CANDIDATE", trackId: top.trackId, confidence, reason: `Likely this song: ${why}${edits}. Please confirm.` };
  }
  return {
    outcome: "NO_MATCH",
    trackId: null,
    confidence: 0,
    reason: "No song stood out: the post may use music that isn't in your catalogue, or none.",
  };
}

function describeEdits(speed: number, pitch: number): string {
  const parts: string[] = [];
  if (Math.abs(speed - 1) >= 0.03) parts.push(`${speed > 1 ? "sped up" : "slowed"} to ${speed.toFixed(2)}×`);
  if (Math.abs(pitch) >= 0.5) parts.push(`pitch ${pitch > 0 ? "+" : ""}${pitch} semitones`);
  return parts.length ? `; ${parts.join(", ")}` : "";
}
