import type { MusicIdentificationInput, MusicIdentificationProvider, MusicIdentificationResult, NormalizedMusicMatch } from "./types";

const ENDPOINT = "https://api.audd.io/";
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * AudD returns a song or nothing, never a score. The pipeline and the UI
 * need a number, so every AudD match carries this fixed one. It is a
 * placeholder for "the vendor reported a match", not a measured probability:
 * the match's `provider` says "audd" wherever it is shown or exported.
 */
export const AUDD_MATCH_CONFIDENCE = 0.9;

export interface AuddProviderOptions {
  apiToken: string;
  /** For tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

/**
 * Identifies the music in a post with AudD (audd.io), written against its
 * public documentation and tested with a stubbed `fetch`; not yet run
 * against the live service. Each of a post's video URLs is sent to AudD in
 * turn until one gets an answer. Costs money per request, so it is only
 * built when an API token is configured (`app/_lib/recognition.ts`).
 *
 * Outcomes: a match, an empty result ("no song identified": AudD found
 * nothing, which is a normal answer), or an error string (AudD or the
 * network failed on every URL). It never throws.
 */
export class AuddRecognitionProvider implements MusicIdentificationProvider {
  readonly providerName = "audd";
  private readonly apiToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly endpoint: string;

  constructor(options: AuddProviderOptions) {
    this.apiToken = options.apiToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.endpoint = options.endpoint ?? ENDPOINT;
  }

  async identify(input: MusicIdentificationInput): Promise<MusicIdentificationResult> {
    if (input.videoUrls.length === 0) {
      return { matches: [], error: null }; // nothing to listen to
    }
    let lastError: string | null = null;
    for (const url of input.videoUrls) {
      const answer = await this.ask(url);
      if (answer.kind === "match") return { matches: [answer.match], error: null };
      if (answer.kind === "none") return { matches: [], error: null };
      lastError = answer.message;
    }
    return { matches: [], error: lastError };
  }

  private async ask(url: string): Promise<{ kind: "match"; match: NormalizedMusicMatch } | { kind: "none" } | { kind: "error"; message: string }> {
    const body = new URLSearchParams({ api_token: this.apiToken, url, return: "spotify,apple_music,deezer" });
    let payload: unknown;
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return { kind: "error", message: `AudD answered HTTP ${response.status}.` };
      payload = await response.json();
    } catch (error) {
      return { kind: "error", message: `AudD could not be reached: ${error instanceof Error ? error.message : "unknown error"}.` };
    }

    const data = payload as { status?: string; result?: unknown; error?: { error_code?: number; error_message?: string } } | null;
    if (!data || typeof data !== "object") return { kind: "error", message: "AudD sent an answer that could not be read." };
    if (data.status === "error") {
      const code = data.error?.error_code;
      return { kind: "error", message: `AudD error${code !== undefined ? ` #${code}` : ""}: ${data.error?.error_message ?? "unknown"}.` };
    }
    const result = data.result;
    if (!result || typeof result !== "object" || Array.isArray(result)) return { kind: "none" };

    const found = result as Record<string, unknown>;
    const title = text(found.title);
    const artist = text(found.artist);
    if (!title || !artist) return { kind: "none" };
    const isrc = isrcFrom(found);
    return {
      kind: "match",
      match: {
        trackId: isrc ?? `audd:${artist}:${title}`.toLowerCase(),
        title,
        artist,
        isrc,
        confidence: AUDD_MATCH_CONFIDENCE,
        provider: "audd",
        manual: false,
      },
    };
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** AudD puts the ISRC inside the streaming services' blocks, when they were asked for. */
function isrcFrom(result: Record<string, unknown>): string | null {
  const spotify = result.spotify as { external_ids?: { isrc?: unknown } } | undefined;
  const apple = result.apple_music as { isrc?: unknown } | undefined;
  const deezer = result.deezer as { isrc?: unknown } | undefined;
  for (const candidate of [spotify?.external_ids?.isrc, apple?.isrc, deezer?.isrc]) {
    const value = text(candidate);
    if (value) return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  }
  return null;
}
