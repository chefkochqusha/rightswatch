export type {
  NormalizedMusicMatch,
  MusicIdentificationInput,
  MusicIdentificationResult,
  MusicIdentificationProvider,
} from './types';
export { NoRecognitionProvider } from './no-recognition-provider';
export { FixtureMusicIdentificationProvider, type FixtureCatalogueSong } from './fixture-provider';
export { AuddRecognitionProvider, AUDD_MATCH_CONFIDENCE, type AuddProviderOptions } from './audd-provider';
