export type {
  RecognitionCandidate,
  RecognitionDecision,
  RecognitionFingerprint,
  RecognitionMatchResult,
  RecognitionOutcome,
  RecognitionThresholds,
} from "./types";
export { DEFAULT_THRESHOLDS, decideRecognition, thresholdsFromEnv } from "./decide";
export { RecognitionServiceError, RecognizerClient, catalogueVersion } from "./client";
export type { IndexTrack, RecognizerClientOptions } from "./client";
export { MEDIA_FORMAT_LABEL, sniffMediaFormat } from "./media-type";
export type { MediaFormat } from "./media-type";
