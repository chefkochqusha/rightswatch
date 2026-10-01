import { redirect } from "next/navigation";
import type { Role } from "@/modules/auth";
import { getSessionUserId, hasSessionCookie } from "./session-cookie";
import { getAuthStore } from "./auth-store";

export interface CurrentSession {
  user: { id: string; email: string; name: string | null };
  workspace: { id: string; name: string; slug: string };
  role: Role;
}

/**
 * The app's Data Access Layer for auth (Next.js App Router guide,
 * "Authorization" > "Creating a Data Access Layer"): the one place that
 * turns a session cookie into real user/workspace/membership data, so
 * every page and Server Action that needs a session goes through here
 * rather than re-deriving it. `proxy.ts` deliberately does NOT call this —
 * it only checks the cookie's signature for a fast redirect (Next's
 * "optimistic checks" guidance); this function does the real, secure check:
 * the session is still live (not logged out), and the user and membership
 * still exist.
 *
 * Phase 5 scope: a user gets exactly one workspace, created at signup
 * (see `modules/auth/sign-up.ts`), so "first membership" is unambiguous
 * today. Multi-workspace membership (joining a second workspace via
 * invite) is future work and would turn this into a workspace *picker*,
 * not a change to the session shape itself.
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const store = getAuthStore();
  const user = await store.users.findById(userId);
  if (!user) return null;

  const memberships = await store.memberships.findForUser(user.id);
  const membership = memberships[0];
  if (!membership) return null;

  const workspace = await store.workspaces.findById(membership.workspaceId);
  if (!workspace) return null;

  return {
    user: { id: user.id, email: user.email, name: user.name },
    workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
    role: membership.role,
  };
}

/**
 * For Server Components/Actions that must have a session — redirects to
 * `/login` rather than returning null, matching the Next.js DAL pattern
 * (`verifySession()` in the App Router auth guide).
 *
 * `?expired=1` when a cookie was sent but no longer resolves (logged out
 * elsewhere, expired, or its account is gone). Without it, `proxy.ts` —
 * which only checks the signature — would bounce `/login` straight back to
 * `/workspace`, and the browser would loop between the two.
 */
export async function requireSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) redirect((await hasSessionCookie()) ? "/login?expired=1" : "/login");
  return session;
}
