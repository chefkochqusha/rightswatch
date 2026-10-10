/**
 * Own song recognition (`services/recognizer`): the shapes the recognition
 * service answers with, and the decision made from them.
 */

/** One song the service found in a post, best first. */
export interface RecognitionCandidate {
  /** The workspace's `MusicTrack` id. */
  trackId: string;
  /** Rarity-weighted landmark votes for one alignment of post and song. */
  score: number;
  /** For the top candidate: the best other song's score. For the others: the top score. */
  nextScore: number;
  /** In how many ~12-second windows of the post this song came out on top. */
  windowsWon: number;
  /** How much faster the post plays the song (1 = original speed). */
  speed: number;
  /** Pitch change in semitones (+ = higher). */
  pitchSemitones: number;
  /** Where in the song the post's audio starts. */
  songOffsetSec: number;
  /**
   * Second check: share of the post's melody that matches the song's at
   * the alignment found (0–1). `null` when it couldn't be checked (a
   * fingerprint made before this check existed, or too little melody).
   */
  melodyAgreement?: number | null;
}

export interface RecognitionMatchResult {
  algorithm: string;
  durationSec: number;
  windows: number;
  candidates: RecognitionCandidate[];
  ms?: number;
}

export interface RecognitionFingerprint {
  algorithm: string;
  /** Base64 of the fingerprint bytes. */
  fingerprint: string;
  durationSec: number;
  hashCount: number;
}

export type RecognitionOutcome = "MATCH" | "CANDIDATE" | "NO_MATCH";

export interface RecognitionDecision {
  outcome: RecognitionOutcome;
  /** The song for MATCH and CANDIDATE. */
  trackId: string | null;
  /**
   * 0–0.99, from how far the song stands out from every other song in the
   * catalogue (1 − next/score). A strength of evidence, not a probability:
   * the UI calls it "match strength".
   */
  confidence: number;
  /** Why, in words a person can check. */
  reason: string;
}

export interface RecognitionThresholds {
  /** Top score ÷ best other score needed to identify the song automatically. */
  matchRatio: number;
  /** … to suggest it for a person to confirm. */
  candidateRatio: number;
  /** A score below this is noise, however it compares. */
  minScore: number;
  /** Share of the post's windows the song must win for an automatic match. */
  minWindowShare: number;
  /** Small next-best scores are raised to this before dividing. */
  ratioFloor: number;
  /** Melody agreement needed for an automatic match (the second check). */
  minMelodyAgreement: number;
}
