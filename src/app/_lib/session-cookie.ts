import { cookies } from "next/headers";
import { endSession, resolveSession, startSession } from "@/modules/auth";
import { getAuthStore } from "./auth-store";
import { SESSION_COOKIE_NAME } from "./session-cookie-name";

/**
 * The session cookie (Brief §40: "session-based auth"), following the
 * Next.js App Router auth guide's "Database Sessions" shape: the cookie
 * holds a signed token naming a session (`modules/auth/session.ts`), and a
 * `Session` row says whether it's still live (`session-lifecycle.ts`). This
 * is the only place in the app that touches the cookie via `next/headers`;
 * `proxy.ts` reads the same cookie through `NextRequest.cookies`, which is
 * why the name lives in `session-cookie-name.ts`.
 */

/** `.env.example`'s placeholder. Anyone can read it, so a deployment still
 *  using it has a session key anyone can sign with. */
const EXAMPLE_SECRET = "replace-with-a-long-random-string";
const MIN_SECRET_LENGTH = 32;
let warnedAboutWeakSecret = false;

/**
 * `SESSION_SECRET`, from which every signing key is derived
 * (`modules/auth/derive-key.ts`) — exported so the invite-link actions read
 * it through the same check.
 *
 * A short or placeholder secret is logged once per server process rather
 * than refused: refusing would take login down on a deployment that might
 * well be using one, and RELEASE_CHECKLIST.md replaces it with a fresh
 * random value before launch anyway. A missing one is refused — there's
 * nothing to sign with.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Copy .env.example to .env and set a long random value.",
    );
  }
  if (!warnedAboutWeakSecret && (secret === EXAMPLE_SECRET || secret.length < MIN_SECRET_LENGTH)) {
    warnedAboutWeakSecret = true;
    console.error(
      JSON.stringify({
        source: "session_secret",
        warning: `SESSION_SECRET is the .env.example placeholder or shorter than ${MIN_SECRET_LENGTH} characters. Replace it with a long random value (RELEASE_CHECKLIST.md).`,
      }),
    );
  }
  return secret;
}

function lifecycleDeps() {
  return { sessionRepository: getAuthStore().sessions, secret: getSessionSecret() };
}

/** Starts a new session for `userId` and sets its cookie. */
export async function setSessionCookie(userId: string): Promise<void> {
  const { token, expiresAt } = await startSession(userId, lifecycleDeps());
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

/** The logged-in user's id — only if the cookie is genuine, unexpired, and
 *  its session hasn't been ended. */
export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await resolveSession(token, lifecycleDeps());
  return session?.userId ?? null;
}

/** Whether the browser sent a session cookie at all, valid or not — tells
 *  "never logged in" apart from "session ended" (see `requireSession`). */
export async function hasSessionCookie(): Promise<boolean> {
  const store = await cookies();
  return store.has(SESSION_COOKIE_NAME);
}

/** Ends the session server-side, then removes the cookie. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) await endSession(token, lifecycleDeps());
  store.delete(SESSION_COOKIE_NAME);
}
