import { NoRecognitionProvider } from "@/modules/music";
import type { MusicIdentificationProvider } from "@/modules/music";

/**
 * Which service identifies the songs in posts a real TikTok scan returns.
 * None: TikTok's commercial data carries no audio, and Bekvor uses no outside
 * recognition service (AudD was removed on 2026-10-10 so nothing depends on
 * one). Such posts are listed as "no song yet"; their song is found with
 * Bekvor's own recognition from the post's video or sound
 * (`own-recognition.ts`), or chosen by a person. Demo data has its own
 * fixture provider and never comes here.
 */
export function getRecognitionProvider(): MusicIdentificationProvider {
  return new NoRecognitionProvider();
}
