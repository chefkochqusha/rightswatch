export type {
  CreatorAllowance,
  CreatorChanges,
  CreatorRecord,
  CreatorRepository,
  CreatorStatus,
  NewCreator,
} from "./types";

export { InMemoryCreatorRepository } from "./in-memory-repository";
// `PrismaCreatorRepository` is deliberately not re-exported — same reason
// as `modules/cases/index.ts`: it pulls in `@/lib/prisma-client`. Import it
// from "@/modules/creators/prisma-repository".

export {
  DuplicateCreatorError,
  addCreator,
  pauseCreator,
  removeCreator,
  resumeCreator,
  scanOutcomeChanges,
  updateCreatorDetails,
} from "./watchlist";
export type {
  AddCreatorError,
  AddCreatorInput,
  AddCreatorResult,
  CreatorRef,
  MonitoringDependencies,
  PauseCreatorResult,
  RemoveCreatorResult,
  ResumeCreatorResult,
  UpdateCreatorDetailsResult,
  WatchlistDependencies,
} from "./watchlist";

export {
  WATCHABLE_PLATFORMS,
  isWatchablePlatform,
  normalizeTikTokUsername,
  normalizeInstagramUsername,
  normalizeUsername,
  platformOfProfileLink,
  tikTokProfileUrl,
  instagramProfileUrl,
  profileUrlFor,
} from "./username";
export type { WatchablePlatform } from "./username";
export { COUNTRY_CODES, normalizeCountryCode } from "./countries";
export { MAX_DISPLAY_NAME_LENGTH, parseCreatorDetails } from "./details";
export type { CreatorDetails, CreatorDetailsError, CreatorDetailsInput } from "./details";
