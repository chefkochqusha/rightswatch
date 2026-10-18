import { createHash, randomBytes } from "node:crypto";
import type { WaitlistEntry, WaitlistRepository } from "./types";

/** The checkbox the form shows. Changing the wording means a new version. */
export const WAITLIST_CONSENT = {
  version: "2026-10-18",
  text: "Email me when my access to Bekvor is ready (an invitation and the date it starts). I can leave the waitlist any time with the link in every email.",
} as const;

/** How long a confirmation link works; unconfirmed addresses are deleted after it. */
export const CONFIRMATION_TTL_MS = 7 * 24 * 3600_000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_COMPANY = 120;

export interface JoinInput {
  email: string;
  company: string;
  /** The consent checkbox was ticked. */
  consent: boolean;
  /** The "for my business, I am 18 or over" checkbox was ticked. */
  business: boolean;
}

export type JoinError = "INVALID_EMAIL" | "COMPANY_TOO_LONG" | "CONSENT_REQUIRED" | "BUSINESS_REQUIRED";

export interface JoinDependencies {
  repository: WaitlistRepository;
  /** Sends the confirmation email with these links; `template` names its version. */
  sendConfirmation: (to: string, links: { confirm: string; leave: string }) => Promise<{ template: string }>;
  linkFor: (kind: "confirm" | "leave", token: string) => string;
  now?: () => Date;
  newToken?: () => string;
}

export type JoinResult = { ok: true } | { ok: false; error: JoinError };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Puts an address on the waitlist and sends the confirmation email. The answer
 * never says whether the address was already there: a confirmed entry gets no
 * new email, an unconfirmed one gets a fresh link (the caller limits how often).
 */
export async function joinWaitlist(input: JoinInput, deps: JoinDependencies): Promise<JoinResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return { ok: false, error: "INVALID_EMAIL" };
  const company = input.company.trim().replace(/\s+/g, " ") || null;
  if (company && company.length > MAX_COMPANY) return { ok: false, error: "COMPANY_TOO_LONG" };
  if (!input.business) return { ok: false, error: "BUSINESS_REQUIRED" };
  if (!input.consent) return { ok: false, error: "CONSENT_REQUIRED" };

  const now = (deps.now ?? (() => new Date()))();
  await deps.repository.deleteUnconfirmedBefore(new Date(now.getTime() - CONFIRMATION_TTL_MS));

  const existing = await deps.repository.findByEmail(email);
  if (existing?.confirmedAt) return { ok: true };

  const token = (deps.newToken ?? (() => randomBytes(32).toString("base64url")))();
  const links = { confirm: deps.linkFor("confirm", token), leave: deps.linkFor("leave", token) };
  const proof = { tokenHash: hashToken(token), consentText: WAITLIST_CONSENT.text, consentVersion: WAITLIST_CONSENT.version, company };
  const entry = existing
    ? await deps.repository.update(existing.id, { ...proof, confirmationSentAt: now })
    : await deps.repository.create({ email, ...proof, confirmationTemplate: "pending", confirmationSentAt: now });
  const sent = await deps.sendConfirmation(email, links);
  await deps.repository.update(entry.id, { confirmationTemplate: sent.template });
  return { ok: true };
}

export type TokenResult = { ok: true; entry: WaitlistEntry } | { ok: false; error: "UNKNOWN_OR_EXPIRED" };

/** Confirms the entry the link belongs to. Idempotent; an expired, unconfirmed link is refused. */
export async function confirmWaitlist(token: string, deps: { repository: WaitlistRepository; now?: () => Date }): Promise<TokenResult> {
  const entry = await deps.repository.findByTokenHash(hashToken(token));
  if (!entry) return { ok: false, error: "UNKNOWN_OR_EXPIRED" };
  if (entry.confirmedAt) return { ok: true, entry };
  const now = (deps.now ?? (() => new Date()))();
  if (now.getTime() - entry.confirmationSentAt.getTime() > CONFIRMATION_TTL_MS) return { ok: false, error: "UNKNOWN_OR_EXPIRED" };
  return { ok: true, entry: await deps.repository.update(entry.id, { confirmedAt: now }) };
}

/** Removes the entry the link belongs to, confirmed or not. Nothing about it is kept. */
export async function leaveWaitlist(token: string, deps: { repository: WaitlistRepository }): Promise<{ ok: boolean }> {
  const entry = await deps.repository.findByTokenHash(hashToken(token));
  if (!entry) return { ok: false };
  await deps.repository.delete(entry.id);
  return { ok: true };
}
