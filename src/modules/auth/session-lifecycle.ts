import { createHash, randomBytes } from "node:crypto";
import { createSessionToken, verifySessionToken } from "./session";
import type { SessionRepository } from "./types";

/**
 * Database-backed sessions (Brief §17 "session management"; the Next.js
 * App Router auth guide's "Database Sessions" shape): the cookie holds a
 * signed token naming a session, and a `Session` row says whether that
 * session is still live. Logging out deletes the row, so a copied cookie
 * stops working the moment its owner logs out — with signed cookies alone
 * it stayed valid for its full 7 days (raised by an independent security
 * review).
 *
 * The signature still matters: `proxy.ts` verifies it for its fast,
 * database-free redirect check, and nothing here touches the database for a
 * token whose signature or expiry is wrong. Only the SHA-256 of the session
 * id is stored, never the id itself.
 */
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionLifecycleDependencies {
  sessionRepository: SessionRepository;
  /** `SESSION_SECRET`. */
  secret: string;
  /** Injectable clock for tests. */
  now?: number;
}

export function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

/** Records a new live session for `userId` and returns the cookie token. */
export async function startSession(
  userId: string,
  deps: SessionLifecycleDependencies,
): Promise<{ token: string; expiresAt: number }> {
  const now = deps.now ?? Date.now();
  const sessionId = randomBytes(32).toString("base64url");
  const expiresAt = now + SESSION_DURATION_MS;

  await deps.sessionRepository.deleteExpiredForUser(userId, new Date(now));
  await deps.sessionRepository.create({
    id: hashSessionId(sessionId),
    userId,
    expiresAt: new Date(expiresAt),
  });

  return { token: createSessionToken({ userId, sessionId, expiresAt }, deps.secret), expiresAt };
}

/** The user a cookie token belongs to — only if its signature is genuine,
 *  it hasn't expired, and its session hasn't been ended. */
export async function resolveSession(
  token: string,
  deps: SessionLifecycleDependencies,
): Promise<{ userId: string } | null> {
  const now = deps.now ?? Date.now();
  const payload = verifySessionToken(token, deps.secret, now);
  if (!payload) return null;

  const row = await deps.sessionRepository.findById(hashSessionId(payload.sessionId));
  if (!row || row.userId !== payload.userId || row.expiresAt.getTime() <= now) return null;
  return { userId: row.userId };
}

/** Ends the session a token names. Checks the signature but not the expiry
 *  — an expired token's row is still worth removing — and does nothing for
 *  a token that isn't genuine. */
export async function endSession(token: string, deps: SessionLifecycleDependencies): Promise<void> {
  // `now = 0` makes the expiry check pass for any token: a signature-only check.
  const payload = verifySessionToken(token, deps.secret, 0);
  if (!payload) return;
  await deps.sessionRepository.delete(hashSessionId(payload.sessionId));
}
