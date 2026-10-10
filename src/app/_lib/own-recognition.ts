import { RecognizerClient, thresholdsFromEnv, type RecognitionThresholds } from "@/modules/recognition";
import { UploadStore } from "@/modules/storage";
import { getJobRunnerMode } from "./job-runner";

/**
 * Own song recognition on our own server: reference audio for catalogue
 * songs, and checking a post's audio against them. It needs three things
 * the Vercel setup doesn't have — the recognition service
 * (`RECOGNIZER_URL` + `RECOGNIZER_TOKEN`), a disk for uploads in progress
 * (`UPLOAD_DIR`) and the background worker (`JOB_RUNNER=worker`) — and is
 * hidden in the app until all are there.
 */

export const FINGERPRINT_TRACK_JOB = "fingerprint_track";
export const AUDIO_CHECK_JOB = "audio_check";

/** A full song in a lossless format can be large; 20 minutes of WAV is ~200 MB, so lossless masters are best sent as FLAC. */
export const MAX_SONG_UPLOAD_BYTES = 150 * 1024 * 1024;
/** A saved TikTok post (video) of up to 10 minutes. */
export const MAX_POST_UPLOAD_BYTES = 200 * 1024 * 1024;
/** Uploads waiting or being processed per workspace, so one can't fill the disk. */
export const MAX_PENDING_UPLOADS = 10;
/** Leftovers of a crashed job are deleted after this. */
export const UPLOAD_MAX_AGE_MS = 24 * 3600_000;

export type OwnRecognitionConfig =
  | { enabled: true; url: string; token: string; uploadDir: string }
  | { enabled: false };

export function ownRecognitionConfig(env: Record<string, string | undefined> = process.env): OwnRecognitionConfig {
  const url = env.RECOGNIZER_URL?.trim();
  const token = env.RECOGNIZER_TOKEN?.trim();
  const uploadDir = env.UPLOAD_DIR?.trim();
  if (!url || !token || !uploadDir || getJobRunnerMode(env) !== "worker") return { enabled: false };
  return { enabled: true, url, token, uploadDir };
}

export function isOwnRecognitionEnabled(): boolean {
  return ownRecognitionConfig().enabled;
}

function requireConfig() {
  const config = ownRecognitionConfig();
  if (!config.enabled) throw new Error("Own recognition isn't configured (RECOGNIZER_URL, RECOGNIZER_TOKEN, UPLOAD_DIR, JOB_RUNNER=worker).");
  return config;
}

export function getUploadStore(): UploadStore {
  return new UploadStore(requireConfig().uploadDir);
}

export function getRecognizerClient(): RecognizerClient {
  const config = requireConfig();
  return new RecognizerClient({ baseUrl: config.url, token: config.token });
}

export function getRecognitionThresholds(): RecognitionThresholds {
  return thresholdsFromEnv();
}
