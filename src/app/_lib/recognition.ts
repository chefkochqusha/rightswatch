import { AuddRecognitionProvider, BudgetedRecognitionProvider, NoRecognitionProvider } from "@/modules/music";
import type { MusicIdentificationProvider } from "@/modules/music";

/**
 * Which service identifies the songs in real posts. AudD, when `AUDD_API_TOKEN`
 * is set (it costs money per post, so it is never on by accident); otherwise
 * nothing, and posts are listed as "no song yet" for a person to identify.
 * Demo data never comes here: it has its own fixture provider.
 */
export type RecognitionMode = "AUDD" | "NONE";

/** At most this many posts are sent to AudD in one scan (about 1 USD at AudD's price); `AUDD_MAX_POSTS_PER_SCAN` changes it. */
export const DEFAULT_MAX_POSTS_PER_SCAN = 200;

export function getRecognitionMode(): RecognitionMode {
  return process.env.AUDD_API_TOKEN?.trim() ? "AUDD" : "NONE";
}

export function maxPostsPerScan(raw: string | undefined = process.env.AUDD_MAX_POSTS_PER_SCAN): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_POSTS_PER_SCAN;
}

/** A new provider for each scan: the spending cap counts that scan's posts. */
export function getRecognitionProvider(): MusicIdentificationProvider {
  const token = process.env.AUDD_API_TOKEN?.trim();
  if (!token) return new NoRecognitionProvider();
  return new BudgetedRecognitionProvider(new AuddRecognitionProvider({ apiToken: token }), maxPostsPerScan());
}
