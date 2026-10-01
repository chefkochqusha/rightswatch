import { createHmac, timingSafeEqual } from "node:crypto";
import { deriveKey } from "./derive-key";

/**
 * The session cookie's value (Brief §40: "session-based auth"): a small
 * HMAC-SHA256-signed payload, not a JWT — so none of the classic JWT
 * footguns (algorithm confusion, `alg: none`), since there is only ever one
 * algorithm here. `SESSION_SECRET` is the only secret involved, and it never
 * leaves the server (Brief §44); the signing key is derived from it per
 * purpose (`derive-key.ts`), so an invite link can never pass as a session.
 *
 * The signature makes the token verifiable without a database round-trip,
 * which is what `proxy.ts`'s optimistic redirect check needs. Whether the
 * session is still *live* — not logged out — is a separate, database-backed
 * question answered in `session-lifecycle.ts`, keyed on `sessionId`.
 */
export interface SessionPayload {
  userId: string;
  /** Random per-login id. Its SHA-256 is the `Session` row's primary key
   *  (`session-lifecycle.ts`); the raw value exists only in the cookie. */
  sessionId: string;
  /** Unix-ms timestamp after which this token must be rejected. */
  expiresAt: number;
}

export function createSessionToken(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/**
 * Verifies a token's signature and expiry, returning the payload only when
 * both check out. `now` defaults to the real clock but can be injected for
 * deterministic tests of expiry without sleeping.
 */
export function verifySessionToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expectedSignature = sign(body, secret);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isSessionPayload(payload)) return null;
  if (now > payload.expiresAt) return null;
  return payload;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", deriveKey(secret, "session-token")).update(body).digest("base64url");
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as SessionPayload;
  return (
    typeof v.userId === "string" &&
    typeof v.sessionId === "string" &&
    v.sessionId.length > 0 &&
    typeof v.expiresAt === "number"
  );
}
