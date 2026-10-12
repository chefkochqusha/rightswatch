import { createHmac, timingSafeEqual } from "node:crypto";
import { deriveKey } from "./derive-key";
import type { Role } from "./types";

/**
 * Signed, stateless invite links — the same HMAC-SHA256 `body.signature`
 * shape as `session.ts`'s tokens, but signed with their own derived key
 * (`derive-key.ts`): an invite link can never verify as a session cookie or
 * the other way round.
 *
 * The token carries the id of an `Invite` row (`inviteId`). The signature
 * proves the link wasn't tampered with; the row decides whether it still
 * counts: `acceptInvite` refuses a link whose row was revoked, accepted or
 * deleted, so an admin can take an invite back before it's used.
 *
 * 7-day expiry is a reasonable default (not a figure from the Brief).
 */
export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * OWNER is never invitable — a workspace has exactly one, set at signup.
 * Enforced where tokens are minted (`inviteTeammate`) *and* where they're
 * read (`verifyInviteToken` below): the token is the only source of truth
 * for the role at acceptance, so it's checked again there rather than
 * trusted because it was checked once already.
 */
export const INVITABLE_ROLES: readonly Role[] = ["ADMIN", "ANALYST", "VIEWER"];

export interface InviteTokenPayload {
  /** The `Invite` row this link belongs to. */
  inviteId: string;
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
 * Verifies a token's signature, expiry and role, returning the payload only
 * when all three check out. `now` defaults to the real clock but can be
 * injected for deterministic tests of expiry without sleeping.
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
  return createHmac("sha256", deriveKey(secret, "invite-token")).update(body).digest("base64url");
}

function isInviteTokenPayload(value: unknown): value is InviteTokenPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as InviteTokenPayload;
  return (
    typeof v.inviteId === "string" &&
    typeof v.workspaceId === "string" &&
    typeof v.workspaceName === "string" &&
    typeof v.email === "string" &&
    INVITABLE_ROLES.includes(v.role) &&
    typeof v.expiresAt === "number"
  );
}
