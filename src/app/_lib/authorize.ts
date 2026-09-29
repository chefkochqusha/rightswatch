import { requireSession, type CurrentSession } from "./current-user";
import type { Role } from "@/modules/auth";

/**
 * Centralized "who can do X" rules for the real workspace's Server Actions.
 * Before teammate invites (`modules/auth/invite-teammate.ts`), every
 * session was an OWNER by construction — Phase 5 signup was the only way
 * in — so no action anywhere checked `session.role` at all (see
 * `case-actions.ts`'s original comment: "gating ANALYST/VIEWER here would
 * be untestable, speculative scope until an invite flow actually produces
 * those roles"). Now that it does, that gap is real: without this, an
 * ANALYST could cancel the workspace's subscription and a VIEWER could
 * open or resolve cases, neither of which the UI even offers them.
 *
 * Each function throws a plain `Error` on denial — same as the existing
 * forged-input guards (`case-actions.ts`'s `requireAssessedItem`,
 * `billing/actions.ts`'s unrecognized-plan-tier check). There's no
 * dedicated "forbidden" page: the real UI never renders an action a role
 * can't perform (see the corresponding `canManage`-style props in
 * `case-panel.tsx`, `billing/page.tsx`, `workspace/page.tsx`), so reaching
 * this check at all means either a stale page (role changed elsewhere) or
 * a forged request — both are fine to surface as a generic 500.
 */

const WORKSPACE_MANAGER_ROLES: Role[] = ["OWNER", "ADMIN"];
const CASE_MANAGER_ROLES: Role[] = ["OWNER", "ADMIN", "ANALYST"];

export function canManageWorkspace(role: Role): boolean {
  return WORKSPACE_MANAGER_ROLES.includes(role);
}

export function canManageCases(role: Role): boolean {
  return CASE_MANAGER_ROLES.includes(role);
}

/** Team invites and billing — the workspace's administrative surface. */
export async function requireWorkspaceManager(): Promise<CurrentSession> {
  const session = await requireSession();
  if (!canManageWorkspace(session.role)) {
    throw new Error("Only owners and admins can do this.");
  }
  return session;
}

/** Cases and the sample-scan pipeline that feeds them. */
export async function requireCaseManager(): Promise<CurrentSession> {
  const session = await requireSession();
  if (!canManageCases(session.role)) {
    throw new Error("Viewers can't do this — ask an owner, admin, or analyst.");
  }
  return session;
}
