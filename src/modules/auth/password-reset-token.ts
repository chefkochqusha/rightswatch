import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { deriveKey } from "./derive-key";

/**
 * Signed, stateless password-reset links, signed with their own derived key
 * (`derive-key.ts`) like session cookies and invite links.
 *
 * There is no server-side record, yet a link is still single-use: it carries
 * a fingerprint of the password hash it was issued against, and
 * `resetPassword` only accepts it while that fingerprint still matches. Once
 * the password changes, every link issued before is dead, including the one
 * just used. The fingerprint is a SHA-256 of the hash, cut short, so a link
 * never exposes the hash itself.
 *
 * One hour is the lifetime (a common default, not a figure from the Brief).
 */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface PasswordResetTokenPayload {
  userId: string;
  fingerprint: string;
  expiresAt: number;
}

export function passwordFingerprint(passwordHash: string): string {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 24);
}

export function createPasswordResetToken(
  user: { id: string; passwordHash: string },
  secret: string,
  now: number = Date.now(),
): string {
  const payload: PasswordResetTokenPayload = {
    userId: user.id,
    fingerprint: passwordFingerprint(user.passwordHash),
    expiresAt: now + PASSWORD_RESET_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifyPasswordResetToken(token: string, secret: string, now: number = Date.now()): PasswordResetTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expected = Buffer.from(sign(body, secret));
  const provided = Buffer.from(signature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const v = payload as PasswordResetTokenPayload;
  if (typeof v?.userId !== "string" || typeof v.fingerprint !== "string" || typeof v.expiresAt !== "number") return null;
  if (now > v.expiresAt) return null;
  return v;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", deriveKey(secret, "password-reset-token")).update(body).digest("base64url");
}
