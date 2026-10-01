import type {
  MusicIdentificationInput,
  MusicIdentificationProvider,
  MusicIdentificationResult,
  NormalizedMusicMatch,
} from './types';
import { DEMO_TRACKS } from '../demo-data/catalog';
import { DEMO_IDENTIFICATION_ERROR, demoCatalogueSongFor, demoIdentificationFor } from '../demo-data/content';
import { looseName, normalizeIsrc } from '../catalog/identity';

/** A song a workspace added to its catalogue, as the demo provider needs it. */
export interface FixtureCatalogueSong {
  trackId: string;
  title: string;
  artist: string | null;
  isrc: string | null;
}

const DATASET_ISRCS = new Set<string>(Object.values(DEMO_TRACKS).map((track) => track.isrc));

/**
 * Demo Mode's stand-in for a real music identification provider (Brief §3,
 * §47). It doesn't analyze `videoUrls`: it answers from the demo dataset
 * (`modules/demo-data`) by content id — a track, nothing, or a failure —
 * so it never needs network access, through the same
 * `MusicIdentificationProvider` interface a real provider will satisfy.
 *
 * Given a workspace's catalogue (`catalogue`), it also "hears" the songs
 * the workspace added itself in some of the dataset's generated posts — a
 * real provider recognises any song, and a demo that never found the songs
 * a user just added would demonstrate nothing. The dataset's own six songs
 * are left to the dataset, so a workspace that loads them sees the same
 * posts the Brief's demo numbers (§48) describe.
 *
 * "No track identified" is an empty `matches` array, not an error: it's a
 * normal outcome of music identification. Content it has never heard of
 * gets that answer too.
 */
export class FixtureMusicIdentificationProvider implements MusicIdentificationProvider {
  readonly providerName = 'fixture';
  private readonly salt: string | undefined;
  private readonly songsByKey: Map<string, FixtureCatalogueSong>;

  /** `salt`: the demo dataset's seed, for the same reason the demo
   *  connector takes one (`mock-connector.ts`). */
  constructor(options: { salt?: string; catalogue?: readonly FixtureCatalogueSong[] } = {}) {
    this.salt = options.salt;
    this.songsByKey = new Map(
      (options.catalogue ?? [])
        .filter((song) => !DATASET_ISRCS.has(normalizeIsrc(song.isrc) ?? ''))
        .map((song) => [songKey(song), song]),
    );
  }

  async identify(
    input: MusicIdentificationInput,
  ): Promise<MusicIdentificationResult> {
    const result = demoIdentificationFor(input.externalContentId, this.salt);
    if (result.kind === 'error') return { matches: [], error: DEMO_IDENTIFICATION_ERROR };

    const own = demoCatalogueSongFor(input.externalContentId, [...this.songsByKey.keys()], this.salt);
    const song = own ? this.songsByKey.get(own.key) : undefined;
    if (own && song) {
      return {
        error: null,
        matches: [this.match({ trackId: song.trackId, title: song.title, artist: song.artist ?? '', isrc: song.isrc }, own.confidence)],
      };
    }

    if (result.kind === 'none') return { matches: [], error: null };
    return { error: null, matches: [this.match(DEMO_TRACKS[result.track], result.confidence)] };
  }

  private match(
    track: { trackId: string; title: string; artist: string; isrc: string | null },
    confidence: number,
  ): NormalizedMusicMatch {
    return {
      trackId: track.trackId,
      title: track.title,
      artist: track.artist,
      isrc: track.isrc,
      confidence,
      provider: this.providerName,
      manual: false,
    };
  }
}

/** Stable across workspaces: the same song added by two workspaces is
 *  "heard" in the same posts. */
function songKey(song: FixtureCatalogueSong): string {
  return normalizeIsrc(song.isrc) ?? `${looseName(song.title)}|${looseName(song.artist)}`;
}
