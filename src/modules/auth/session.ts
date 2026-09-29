import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Session-based auth (Brief §40 tech stack: "session-based auth"). This is
 * a signed cookie value, not a database-backed session id and not a JWT —
 * a small HMAC-SHA256-signed payload carrying just enough to identify who
 * is logged in and until when, verifiable with no database round-trip and
 * no third-party JWT library (and so none of the classic JWT footguns —
 * algorithm confusion, `alg: none`, and so on — since there is only ever
 * one algorithm here). `SESSION_SECRET` (see `.env.example`) is the only
 * secret involved, and it never leaves the server (Brief §44).
 */
export interface SessionPayload {
  userId: string;
  /** Unix-ms timestamp after which this token must be rejected. */
  expiresAt: number;
}

export function createSessionToken(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
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
  const parts = token.split('.');
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
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isSessionPayload(payload)) return null;
  if (now > payload.expiresAt) return null;
  return payload;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

function isSessionPayload(value: unknown): value is SessionPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SessionPayload).userId === 'string' &&
    typeof (value as SessionPayload).expiresAt === 'number'
  );
}
