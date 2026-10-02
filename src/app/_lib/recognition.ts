import { AuddRecognitionProvider, NoRecognitionProvider } from "@/modules/music";
import type { MusicIdentificationProvider } from "@/modules/music";

/**
 * Which service identifies the songs in real posts. AudD, when `AUDD_API_TOKEN`
 * is set (it costs money per post, so it is never on by accident); otherwise
 * nothing, and posts are listed as "no song yet" for a person to identify.
 * Demo data never comes here: it has its own fixture provider.
 */
export type RecognitionMode = "AUDD" | "NONE";

export function getRecognitionMode(): RecognitionMode {
  return process.env.AUDD_API_TOKEN?.trim() ? "AUDD" : "NONE";
}

export function getRecognitionProvider(): MusicIdentificationProvider {
  const token = process.env.AUDD_API_TOKEN?.trim();
  return token ? new AuddRecognitionProvider({ apiToken: token }) : new NoRecognitionProvider();
}
