import type { Platform } from "../connectors/types";

/**
 * Creator management (Master Brief §8): the workspace's watchlist — the
 * creators whose commercial content scans fetch. Field names mirror
 * `prisma/schema.prisma`'s `Creator` model.
 *
 * Two fields answer different questions and are kept in step:
 * `monitoringEnabled` is the switch a member flips (pause/resume) and what
 * a scan reads; `status` is what the watchlist shows (§8: Active, Paused,
 * Error, Pending), set by those actions and by how the last scan went.
 *
 * Removing a creator is a soft delete (`removedAt`): the creator leaves the
 * watchlist and is never scanned again, but its content, assessments and
 * cases stay — §13, "Every case should preserve evidence". Adding the same
 * username again restores it.
 */

export type CreatorStatus = "PENDING" | "ACTIVE" | "PAUSED" | "ERROR";

export interface CreatorRecord {
  id: string;
  workspaceId: string;
  platform: Platform;
  /** For TikTok, the username: the Commercial Content API is queried by
   *  username and returns no other stable creator id (Brief §4). */
  externalId: string;
  /** The username as shown, without "@". */
  handle: string;
  displayName: string | null;
  profileUrl: string | null;
  /** ISO 3166-1 alpha-2 — the territory signal for posts the platform
   *  reports none for (`runScan`'s `creatorCountry`). */
  country: string | null;
  followerCount: number | null;
  status: CreatorStatus;
  monitoringEnabled: boolean;
  /** The last time a scan reached this creator. */
  lastSeenAt: Date | null;
  /** Why the last scan couldn't, while `status` is ERROR. */
  lastError: string | null;
  removedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewCreator {
  workspaceId: string;
  platform: Platform;
  externalId: string;
  handle: string;
  displayName: string | null;
  profileUrl: string | null;
  country: string | null;
  followerCount: number | null;
}

export type CreatorChanges = Partial<
  Pick<
    CreatorRecord,
    | "displayName"
    | "country"
    | "followerCount"
    | "status"
    | "monitoringEnabled"
    | "lastSeenAt"
    | "lastError"
    | "removedAt"
  >
>;

export interface CreatorRepository {
  create(input: NewCreator): Promise<CreatorRecord>;
  /** Scoped by workspace: another workspace's creator is never returned. */
  findById(workspaceId: string, id: string): Promise<CreatorRecord | null>;
  /** Including a removed one — how adding a username again finds the row to
   *  restore rather than tripping the unique key. */
  findByExternalId(workspaceId: string, platform: Platform, externalId: string): Promise<CreatorRecord | null>;
  /** The watchlist: every creator not removed, oldest first. */
  findForWorkspace(workspaceId: string): Promise<CreatorRecord[]>;
  /** Watchlist creators with monitoring on — what a plan's creator limit
   *  counts (Brief §19). */
  countMonitored(workspaceId: string): Promise<number>;
  update(id: string, changes: CreatorChanges): Promise<CreatorRecord>;
}

/**
 * How many creators a workspace may monitor at once (Brief §19: "Plans
 * should enforce limits through backend logic"). Supplied by the caller —
 * this module knows nothing about billing — so a plan's limit is read in
 * one place (`app/_lib/creator-allowance.ts`).
 */
export interface CreatorAllowance {
  /** 0 when the workspace has no active plan. */
  cap: number;
  planName: string | null;
}
