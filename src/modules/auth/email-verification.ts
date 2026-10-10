import { createHmac, timingSafeEqual } from "node:crypto";
import { deriveKey } from "./derive-key";
import type { RateLimiter } from "./rate-limiter";
import type { UserRepository } from "./types";

/**
 * Confirming that an address is the person's own: a signed, stateless link
 * with its own derived key, like the reset and invite links. It names the
 * user and the exact address, so a link sent to an old address can't
 * confirm a different one. Three days is the lifetime (a common default,
 * not a figure from the Brief). Opening a link twice is harmless.
 */
export const EMAIL_VERIFICATION_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export interface EmailVerificationPayload {
  userId: string;
  email: string;
  expiresAt: number;
}

export function createEmailVerificationToken(user: { id: string; email: string }, secret: string, now: number = Date.now()): string {
  const payload: EmailVerificationPayload = { userId: user.id, email: user.email, expiresAt: now + EMAIL_VERIFICATION_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function verifyEmailVerificationToken(token: string, secret: string, now: number = Date.now()): EmailVerificationPayload | null {
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
  const v = payload as EmailVerificationPayload;
  if (typeof v?.userId !== "string" || typeof v.email !== "string" || typeof v.expiresAt !== "number") return null;
  if (now > v.expiresAt) return null;
  return v;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", deriveKey(secret, "email-verification-token")).update(body).digest("base64url");
}

export interface SendVerificationDependencies {
  userRepository: UserRepository;
  rateLimiter?: RateLimiter;
  secret: string;
  linkFor: (token: string) => string;
  sendLink: (to: string, link: string) => Promise<void>;
  now?: number;
}

export type SendVerificationResult = { ok: true } | { ok: false; error: "ALREADY_VERIFIED" | "RATE_LIMITED" | "NO_SUCH_USER" };

/** Emails a confirmation link to the user's address, unless it is confirmed already. */
export async function sendEmailVerification(userId: string, deps: SendVerificationDependencies): Promise<SendVerificationResult> {
  const user = await deps.userRepository.findById(userId);
  if (!user) return { ok: false, error: "NO_SUCH_USER" };
  if (user.emailVerifiedAt) return { ok: false, error: "ALREADY_VERIFIED" };

  const key = `verify-email:${userId}`;
  if ((await deps.rateLimiter?.isBlocked(key))?.blocked) return { ok: false, error: "RATE_LIMITED" };
  await deps.rateLimiter?.recordFailure(key);

  const token = createEmailVerificationToken(user, deps.secret, deps.now);
  await deps.sendLink(user.email, deps.linkFor(token));
  return { ok: true };
}

export type VerifyEmailResult = { ok: true } | { ok: false; error: "INVALID_TOKEN" };

/** Confirms the address a link was sent to. */
export async function verifyEmail(
  token: string,
  deps: { userRepository: UserRepository; secret: string; now?: number },
): Promise<VerifyEmailResult> {
  const payload = verifyEmailVerificationToken(token, deps.secret, deps.now);
  if (!payload) return { ok: false, error: "INVALID_TOKEN" };
  const user = await deps.userRepository.findById(payload.userId);
  // The address must still be the one the link was sent to.
  if (!user || user.email !== payload.email) return { ok: false, error: "INVALID_TOKEN" };
  await deps.userRepository.markEmailVerified(user.id, new Date(deps.now ?? Date.now()));
  return { ok: true };
}
