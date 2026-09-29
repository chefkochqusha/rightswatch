import type { NormalizedMusicMatch } from './types';

/**
 * Deterministic demo tracks and their matches, keyed by the
 * `externalContentId` of the commercial content they appear in (Brief §6
 * Demo Mode). These ids line up with
 * `connectors/tiktok/fixtures.ts` so the two datasets compose into one
 * coherent, reproducible demo scan end to end.
 *
 * A real ProviderA/ProviderB would fingerprint `videoUrls` and return this
 * same shape — this fixture just returns a fixed answer per content id
 * instead of analyzing audio.
 */
export const FIXTURE_TRACKS = {
  neonSkyline: {
    trackId: 'demo-track-1',
    title: 'Neon Skyline',
    artist: 'Aurora Belle',
    isrc: 'DEA123456789',
  },
  midnightDrive: {
    trackId: 'demo-track-2',
    title: 'Midnight Drive',
    artist: 'Kaïro',
    isrc: 'USB987654321',
  },
  goldenHour: {
    trackId: 'demo-track-3',
    title: 'Golden Hour',
    artist: 'Wilder Sun',
    isrc: 'GBX445566778',
  },
  paperTrails: {
    trackId: 'demo-track-4',
    title: 'Paper Trails',
    artist: 'Ivy League',
    isrc: 'FRA112233445',
  },
  staticBloom: {
    trackId: 'demo-track-5',
    title: 'Static Bloom',
    artist: 'Reyes & Vine',
    isrc: 'NLB556677889',
  },
  slowOrbit: {
    trackId: 'demo-track-6',
    title: 'Slow Orbit',
    artist: 'Marlowe Days',
    isrc: 'USC998877665',
  },
  coastalBloom: {
    trackId: 'demo-track-7',
    title: 'Coastal Bloom',
    artist: 'Sable Reyes',
    isrc: 'DEB223344556',
  },
} as const;

/** externalContentId -> the single best match a real provider would return. */
export const FIXTURE_MATCHES_BY_CONTENT_ID: Record<string, NormalizedMusicMatch> = {
  'tt-cc-1001': {
    ...FIXTURE_TRACKS.neonSkyline,
    confidence: 0.97,
    provider: 'fixture',
    manual: false,
  },
  'tt-cc-1002': {
    ...FIXTURE_TRACKS.goldenHour,
    confidence: 0.91,
    provider: 'fixture',
    manual: false,
  },
  'tt-cc-2001': {
    ...FIXTURE_TRACKS.midnightDrive,
    confidence: 0.95,
    provider: 'fixture',
    manual: false,
  },
  'tt-cc-2002': {
    ...FIXTURE_TRACKS.neonSkyline,
    confidence: 0.93,
    provider: 'fixture',
    manual: false,
  },
  'tt-cc-3001': {
    ...FIXTURE_TRACKS.paperTrails,
    confidence: 0.89,
    provider: 'fixture',
    manual: false,
  },
  'tt-cc-4001': {
    ...FIXTURE_TRACKS.staticBloom,
    confidence: 0.92,
    provider: 'fixture',
    manual: false,
  },
  'tt-cc-4002': {
    ...FIXTURE_TRACKS.slowOrbit,
    confidence: 0.88,
    provider: 'fixture',
    manual: false,
  },
  'tt-cc-1003': {
    ...FIXTURE_TRACKS.coastalBloom,
    confidence: 0.94,
    provider: 'fixture',
    manual: false,
  },
  'tt-cc-2003': {
    ...FIXTURE_TRACKS.coastalBloom,
    confidence: 0.9,
    provider: 'fixture',
    manual: false,
  },
};
