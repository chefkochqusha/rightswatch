import { parseCreatorDetails, type CreatorDetailsError, type CreatorDetailsInput } from "./details";
import { normalizeTikTokUsername, tikTokProfileUrl } from "./username";
import type { CreatorAllowance, CreatorChanges, CreatorRecord, CreatorRepository } from "./types";

/**
 * The watchlist actions Brief §8 lists — add, remove, pause, resume — and
 * editing a creator's details. Every one is scoped to one workspace: a
 * creator id from another workspace is "not found", never touched.
 *
 * Plan limits (Brief §19) are enforced here, on the two actions that start
 * monitoring a creator: adding one and resuming one. Pausing frees a place.
 */

/** Thrown by a repository when a creator with the same platform id is
 *  already in the workspace — the unique key catching what a concurrent
 *  add got to first. */
export class DuplicateCreatorError extends Error {
  constructor() {
    super("This creator is already in the workspace.");
    this.name = "DuplicateCreatorError";
  }
}

export interface WatchlistDependencies {
  creatorRepository: CreatorRepository;
}

export interface MonitoringDependencies extends WatchlistDependencies {
  allowance: CreatorAllowance;
}

type AllowanceError = "NO_PLAN" | "LIMIT_REACHED";

async function checkAllowance(workspaceId: string, deps: MonitoringDependencies): Promise<AllowanceError | null> {
  if (deps.allowance.cap <= 0) return "NO_PLAN";
  const monitored = await deps.creatorRepository.countMonitored(workspaceId);
  return monitored >= deps.allowance.cap ? "LIMIT_REACHED" : null;
}

/** What `status` should read once monitoring is on, judging by the last
 *  scan: nothing yet, or it reached the creator. */
function monitoringStatus(creator: Pick<CreatorRecord, "lastSeenAt">): "ACTIVE" | "PENDING" {
  return creator.lastSeenAt ? "ACTIVE" : "PENDING";
}

// --- Add ----------------------------------------------------------------

export interface AddCreatorInput extends CreatorDetailsInput {
  workspaceId: string;
  /** As typed: "@name", "name", or a profile link. */
  username: string;
}

export type AddCreatorError =
  | "USERNAME_REQUIRED"
  | "USERNAME_INVALID"
  | CreatorDetailsError
  | "ALREADY_ON_WATCHLIST"
  | AllowanceError;

export type AddCreatorResult =
  | { ok: true; creator: CreatorRecord; restored: boolean }
  | { ok: false; error: AddCreatorError };

/**
 * Adds a TikTok creator to the watchlist, monitored from the start. A
 * creator removed earlier comes back as the same record — with its
 * history — rather than as a second one.
 */
export async function addCreator(input: AddCreatorInput, deps: MonitoringDependencies): Promise<AddCreatorResult> {
  const username = normalizeTikTokUsername(input.username);
  if (!username.ok) return { ok: false, error: username.error };

  const parsed = parseCreatorDetails(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { details } = parsed;

  const existing = await deps.creatorRepository.findByExternalId(input.workspaceId, "TIKTOK", username.username);
  if (existing && !existing.removedAt) return { ok: false, error: "ALREADY_ON_WATCHLIST" };

  const allowanceError = await checkAllowance(input.workspaceId, deps);
  if (allowanceError) return { ok: false, error: allowanceError };

  if (existing) {
    // Details left empty keep what was on file before the removal.
    const creator = await deps.creatorRepository.update(existing.id, {
      removedAt: null,
      monitoringEnabled: true,
      status: monitoringStatus(existing),
      lastError: null,
      displayName: details.displayName ?? existing.displayName,
      country: details.country ?? existing.country,
      followerCount: details.followerCount ?? existing.followerCount,
    });
    return { ok: true, creator, restored: true };
  }

  try {
    const creator = await deps.creatorRepository.create({
      workspaceId: input.workspaceId,
      platform: "TIKTOK",
      externalId: username.username,
      handle: username.username,
      profileUrl: tikTokProfileUrl(username.username),
      ...details,
    });
    return { ok: true, creator, restored: false };
  } catch (error) {
    if (error instanceof DuplicateCreatorError) return { ok: false, error: "ALREADY_ON_WATCHLIST" };
    throw error;
  }
}

// --- Pause / resume -----------------------------------------------------

export interface CreatorRef {
  workspaceId: string;
  creatorId: string;
}

export type PauseCreatorResult = { ok: true; creator: CreatorRecord } | { ok: false; error: "NOT_FOUND" };

/** Stops scans from fetching this creator. Idempotent. */
export async function pauseCreator(ref: CreatorRef, deps: WatchlistDependencies): Promise<PauseCreatorResult> {
  const creator = await findOnWatchlist(ref, deps);
  if (!creator) return { ok: false, error: "NOT_FOUND" };
  if (!creator.monitoringEnabled) return { ok: true, creator };
  return {
    ok: true,
    creator: await deps.creatorRepository.update(creator.id, { monitoringEnabled: false, status: "PAUSED" }),
  };
}

export type ResumeCreatorResult =
  | { ok: true; creator: CreatorRecord }
  | { ok: false; error: "NOT_FOUND" | AllowanceError };

/** Turns monitoring back on, if the plan has room. Idempotent. */
export async function resumeCreator(ref: CreatorRef, deps: MonitoringDependencies): Promise<ResumeCreatorResult> {
  const creator = await findOnWatchlist(ref, deps);
  if (!creator) return { ok: false, error: "NOT_FOUND" };
  if (creator.monitoringEnabled) return { ok: true, creator };

  const allowanceError = await checkAllowance(ref.workspaceId, deps);
  if (allowanceError) return { ok: false, error: allowanceError };

  return {
    ok: true,
    creator: await deps.creatorRepository.update(creator.id, {
      monitoringEnabled: true,
      status: monitoringStatus(creator),
      lastError: null,
    }),
  };
}

// --- Remove -------------------------------------------------------------

export type RemoveCreatorResult = { ok: true } | { ok: false; error: "NOT_FOUND" };

/** Takes the creator off the watchlist; its content and cases stay. */
export async function removeCreator(ref: CreatorRef, deps: WatchlistDependencies): Promise<RemoveCreatorResult> {
  const creator = await findOnWatchlist(ref, deps);
  if (!creator) return { ok: false, error: "NOT_FOUND" };
  await deps.creatorRepository.update(creator.id, { removedAt: new Date(), monitoringEnabled: false });
  return { ok: true };
}

// --- Edit details -------------------------------------------------------

export type UpdateCreatorDetailsResult =
  | { ok: true; creator: CreatorRecord }
  | { ok: false; error: "NOT_FOUND" | CreatorDetailsError };

/** Replaces display name, country and follower count — an empty field
 *  clears it. */
export async function updateCreatorDetails(
  input: CreatorRef & CreatorDetailsInput,
  deps: WatchlistDependencies,
): Promise<UpdateCreatorDetailsResult> {
  const creator = await findOnWatchlist(input, deps);
  if (!creator) return { ok: false, error: "NOT_FOUND" };

  const parsed = parseCreatorDetails(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, creator: await deps.creatorRepository.update(creator.id, parsed.details) };
}

// --- Scan outcome -------------------------------------------------------

/**
 * What a scan's outcome for one creator changes: reached it — `ACTIVE`
 * and seen now; couldn't — `ERROR` with the reason (Brief §37: say what
 * went wrong). A creator paused while the scan ran stays paused.
 */
export function scanOutcomeChanges(
  creator: Pick<CreatorRecord, "monitoringEnabled">,
  outcome: { at: Date; error: string | null },
): CreatorChanges {
  if (outcome.error) {
    return { lastError: outcome.error, ...(creator.monitoringEnabled ? { status: "ERROR" as const } : {}) };
  }
  return {
    lastSeenAt: outcome.at,
    lastError: null,
    ...(creator.monitoringEnabled ? { status: "ACTIVE" as const } : {}),
  };
}

async function findOnWatchlist(ref: CreatorRef, deps: WatchlistDependencies): Promise<CreatorRecord | null> {
  const creator = await deps.creatorRepository.findById(ref.workspaceId, ref.creatorId);
  return creator && !creator.removedAt ? creator : null;
}
