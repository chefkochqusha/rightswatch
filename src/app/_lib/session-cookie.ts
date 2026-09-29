import { cookies } from "next/headers";
import { createSessionToken, verifySessionToken, type SessionPayload } from "@/modules/auth";
import { SESSION_COOKIE_NAME } from "./session-cookie-name";

/**
 * Stateless, signed-cookie session management (Brief §40: "session-based
 * auth"), following the Next.js-recommended shape for this (App Router
 * guide "Authentication" > "Session Management" > "Stateless Sessions")
 * but with this project's own HMAC token (`modules/auth/session.ts`)
 * instead of a JWT library — see that file for why. This is the only
 * place in the app that touches the cookie via `next/headers`; `proxy.ts`
 * reads the same cookie through a different API (`NextRequest.cookies`),
 * which is why the name is shared via `session-cookie-name.ts` instead of
 * living here.
 */
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Exported (not just used internally) so other signed-token needs — the
 * invite-link tokens in `app/workspace/team/actions.ts` and
 * `app/invite/accept/actions.ts` — sign with the same server secret without
 * duplicating this env-var lookup and its error message a second time.
 * `modules/auth/invite-token.ts` deliberately doesn't share *token* code
 * with `session.ts`, but the secret itself is just configuration, not
 * hardened logic, so reusing this getter carries none of that risk.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Copy .env.example to .env and set a long random value.",
    );
  }
  return secret;
}

export async function setSessionCookie(userId: string): Promise<void> {
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  const token = createSessionToken({ userId, expiresAt }, getSessionSecret());
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token, getSessionSecret());
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
