/** Partner programme (affiliate stage 1). Field names mirror the Prisma models. */

export interface PartnerRecord {
  id: string;
  userId: string;
  code: string;
  termsAcceptedAt: Date;
  createdAt: Date;
}

export interface ReferralRecord {
  id: string;
  partnerId: string;
  workspaceId: string;
  commissionUntil: Date;
  createdAt: Date;
}

export interface CommissionRecord {
  id: string;
  partnerId: string;
  referralId: string | null;
  sourceId: string;
  invoiceCents: number;
  amountCents: number;
  earnedAt: Date;
  paidOutAt: Date | null;
  createdAt: Date;
}

export interface ReferralRepository {
  findPartnerByUser(userId: string): Promise<PartnerRecord | null>;
  findPartnerByCode(code: string): Promise<PartnerRecord | null>;
  /** Throws on a duplicate code (unique), so the caller can retry with a new one. */
  createPartner(input: { userId: string; code: string; termsAcceptedAt: Date }): Promise<PartnerRecord>;
  findReferralByWorkspace(workspaceId: string): Promise<ReferralRecord | null>;
  createReferral(input: { partnerId: string; workspaceId: string; commissionUntil: Date }): Promise<ReferralRecord>;
  findReferralsForPartner(partnerId: string): Promise<ReferralRecord[]>;
  /** Idempotent on `sourceId`: a second call for the same invoice returns the existing row. */
  createCommission(input: Omit<CommissionRecord, "id" | "createdAt" | "paidOutAt">): Promise<{ commission: CommissionRecord; created: boolean }>;
  findCommissionsForPartner(partnerId: string): Promise<CommissionRecord[]>;
}
