import { createHmac, timingSafeEqual } from "node:crypto";
import type { Role } from "./types";

/**
 * Signed, stateless invite links — deliberately the same HMAC-SHA256
 * shape as `session.ts`'s tokens (kept as its own small file rather than
 * sharing code with `session.ts`, so the already-hardened session path
 * stays untouched). Stateless means there is no server-side invite record
 * to look up, which has two honest consequences worth knowing: an invite
 * can't be revoked once issued (it's valid until it expires, same
 * limitation a session token already has), and there's no "pending
 * invites" list to show — only membership once one is actually accepted.
 *
 * 7-day expiry is a reasonable default (not a figure from the Brief).
 */
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface InviteTokenPayload {
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: Role;
  /** Unix-ms timestamp after which this token must be rejected. */
  expiresAt: number;
}

export function createInviteToken(
  payload: Omit<InviteTokenPayload, "expiresAt">,
  secret: string,
  now: number = Date.now(),
): string {
  const full: InviteTokenPayload = { ...payload, expiresAt: now + INVITE_TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/**
 * Verifies a token's signature and expiry, returning the payload only when
 * both check out. `now` defaults to the real clock but can be injected for
 * deterministic tests of expiry without sleeping.
 */
export function verifyInviteToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): InviteTokenPayload | null {
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
  if (!isInviteTokenPayload(payload)) return null;
  if (now > payload.expiresAt) return null;
  return payload;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function isInviteTokenPayload(value: unknown): value is InviteTokenPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as InviteTokenPayload;
  return (
    typeof v.workspaceId === "string" &&
    typeof v.workspaceName === "string" &&
    typeof v.email === "string" &&
    typeof v.role === "string" &&
    typeof v.expiresAt === "number"
  );
}
