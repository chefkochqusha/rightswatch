/**
 * Music identification architecture (Master Brief §1, §43).
 *
 * Mirrors the connector boundary exactly: a MusicIdentificationProvider is
 * the only code allowed to know how a specific provider (an audio-
 * fingerprinting vendor, a catalogue-matching service, or a human doing it
 * manually) actually works. Everything downstream — the rights engine, the
 * Case UI — only ever sees `NormalizedMusicMatch`. Brief §1 names four
 * concrete implementations that all share this one interface: ProviderA,
 * ProviderB, CatalogueMatchingProvider, ManualMusicIdentification.
 */

export interface NormalizedMusicMatch {
  /** Internal MusicTrack id (Brief §43) this content was matched to. */
  trackId: string;
  title: string;
  artist: string;
  isrc: string | null;
  /** 0–1. How confident the provider is in this match. */
  confidence: number;
  /** Which provider produced this match, e.g. "acoustid", "catalogue",
   *  "manual" — kept as a plain string (not an enum) so a new provider
   *  never requires a change to this shared type. */
  provider: string;
  /** True when an ANALYST identified the track by hand rather than a
   *  provider matching it automatically (Brief §1: ManualMusicIdentification). */
  manual: boolean;
}

export interface MusicIdentificationInput {
  externalContentId: string;
  /** Public video/post URL(s) a provider would fingerprint. Unused by a
   *  catalogue- or fixture-based provider, required by an audio-
   *  fingerprinting one — present here so the interface doesn't need to
   *  change when a real audio-based provider is added. */
  videoUrls: string[];
}

export interface MusicIdentificationResult {
  /** Zero or more candidate matches, ordered highest-confidence first. An
   *  empty array is a legitimate outcome ("no track could be identified"),
   *  distinct from `error`, which means the provider itself failed to run. */
  matches: NormalizedMusicMatch[];
  error: string | null;
}

export interface MusicIdentificationProvider {
  readonly providerName: string;
  identify(input: MusicIdentificationInput): Promise<MusicIdentificationResult>;
}
