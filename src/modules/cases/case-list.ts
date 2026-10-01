import { ACTIVE_CASE_STATUSES, CASE_PRIORITY_ORDER, type CaseRecord, type CaseStatus } from "./types";

/** The cases list's three views: what still needs someone, what's done, everything. */
export type CaseGroup = "active" | "closed" | "all";

export function statusInGroup(status: CaseStatus, group: CaseGroup): boolean {
  if (group === "all") return true;
  const active = ACTIVE_CASE_STATUSES.includes(status);
  return group === "active" ? active : !active;
}

/**
 * Most urgent first: by priority, then the one touched longest ago, so a
 * case nobody has looked at in a while surfaces above a fresh one of the
 * same priority.
 */
export function sortCasesByUrgency<T extends Pick<CaseRecord, "priority" | "updatedAt">>(cases: readonly T[]): T[] {
  return [...cases].sort(
    (a, b) => CASE_PRIORITY_ORDER[a.priority] - CASE_PRIORITY_ORDER[b.priority] || a.updatedAt.getTime() - b.updatedAt.getTime(),
  );
}
