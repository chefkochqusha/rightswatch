import { randomInt } from "node:crypto";
import type { CommissionRecord, PartnerRecord, ReferralRecord, ReferralRepository } from "./types";

/** The terms of the partner programme. The numbers live here and nowhere else. */
export const PARTNER_PROGRAMME = {
  commissionPercent: 10,
  commissionMonths: 12,
} as const;

// No 0/o, 1/l/i: codes get read out and typed by hand.
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 8;

export function generatePartnerCode(rand: (max: number) => number = randomInt): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[rand(CODE_ALPHABET.length)];
  return code;
}

/** A code from a link, cleaned up; null when it can't be one of ours. */
export function normalizePartnerCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

/** The commission on an invoice, in cents (rounded down: never pay out more than the terms say). */
export function commissionCents(invoiceCents: number): number {
  if (!Number.isFinite(invoiceCents) || invoiceCents <= 0) return 0;
  return Math.floor((invoiceCents * PARTNER_PROGRAMME.commissionPercent) / 100);
}

export function commissionUntil(from: Date): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + PARTNER_PROGRAMME.commissionMonths);
  return d;
}

/** Joins the programme (accepting its terms); returns the existing partner when already in. */
export async function joinPartnerProgramme(
  input: { userId: string; acceptedTerms: boolean; now?: Date },
  deps: { referrals: ReferralRepository; generateCode?: () => string },
): Promise<{ ok: true; partner: PartnerRecord } | { ok: false; error: "TERMS_NOT_ACCEPTED" }> {
  const existing = await deps.referrals.findPartnerByUser(input.userId);
  if (existing) return { ok: true, partner: existing };
  if (!input.acceptedTerms) return { ok: false, error: "TERMS_NOT_ACCEPTED" };
  const generate = deps.generateCode ?? (() => generatePartnerCode());
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return { ok: true, partner: await deps.referrals.createPartner({ userId: input.userId, code: generate(), termsAcceptedAt: input.now ?? new Date() }) };
    } catch (error) {
      lastError = error; // code taken: try another
    }
  }
  throw lastError;
}

export type RecordReferralResult =
  | { ok: true; referral: ReferralRecord }
  | { ok: false; reason: "NO_CODE" | "UNKNOWN_CODE" | "SELF_REFERRAL" | "ALREADY_REFERRED" };

/**
 * Links a newly created workspace to the partner whose code was in the signup
 * link. A partner can't refer their own new workspace, and a workspace is
 * referred at most once.
 */
export async function recordReferral(
  input: { code: unknown; workspaceId: string; signupUserId: string; now?: Date },
  deps: { referrals: ReferralRepository },
): Promise<RecordReferralResult> {
  const code = normalizePartnerCode(input.code);
  if (!code) return { ok: false, reason: "NO_CODE" };
  const partner = await deps.referrals.findPartnerByCode(code);
  if (!partner) return { ok: false, reason: "UNKNOWN_CODE" };
  if (partner.userId === input.signupUserId) return { ok: false, reason: "SELF_REFERRAL" };
  if (await deps.referrals.findReferralByWorkspace(input.workspaceId)) return { ok: false, reason: "ALREADY_REFERRED" };
  const now = input.now ?? new Date();
  return { ok: true, referral: await deps.referrals.createReferral({ partnerId: partner.id, workspaceId: input.workspaceId, commissionUntil: commissionUntil(now) }) };
}

/**
 * A referred workspace paid an invoice: the partner earns the commission if
 * the payment falls inside the commission window. Idempotent per invoice.
 */
export async function recordCommission(
  input: { workspaceId: string; invoiceId: string; invoiceCents: number; paidAt: Date },
  deps: { referrals: ReferralRepository },
): Promise<"created" | "duplicate" | "not_referred" | "outside_window" | "zero"> {
  const referral = await deps.referrals.findReferralByWorkspace(input.workspaceId);
  if (!referral) return "not_referred";
  if (input.paidAt > referral.commissionUntil) return "outside_window";
  const amount = commissionCents(input.invoiceCents);
  if (amount === 0) return "zero";
  const { created } = await deps.referrals.createCommission({
    partnerId: referral.partnerId,
    referralId: referral.id,
    sourceId: input.invoiceId,
    invoiceCents: input.invoiceCents,
    amountCents: amount,
    earnedAt: input.paidAt,
  });
  return created ? "created" : "duplicate";
}

export function summarizeCommissions(rows: readonly CommissionRecord[]): { earnedCents: number; paidOutCents: number; openCents: number } {
  const earnedCents = rows.reduce((sum, c) => sum + c.amountCents, 0);
  const paidOutCents = rows.filter((c) => c.paidOutAt).reduce((sum, c) => sum + c.amountCents, 0);
  return { earnedCents, paidOutCents, openCents: earnedCents - paidOutCents };
}
