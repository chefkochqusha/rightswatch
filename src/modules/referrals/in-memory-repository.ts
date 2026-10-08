import type { CommissionRecord, PartnerRecord, ReferralRecord, ReferralRepository } from "./types";

let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

/** For tests: same contract as the Prisma repository, including the unique keys. */
export class InMemoryReferralRepository implements ReferralRepository {
  partners: PartnerRecord[] = [];
  referrals: ReferralRecord[] = [];
  commissions: CommissionRecord[] = [];

  async findPartnerByUser(userId: string) { return this.partners.find((p) => p.userId === userId) ?? null; }
  async findPartnerByCode(code: string) { return this.partners.find((p) => p.code === code) ?? null; }
  async createPartner(input: { userId: string; code: string; termsAcceptedAt: Date }) {
    if (this.partners.some((p) => p.code === input.code || p.userId === input.userId)) throw new Error("unique constraint");
    const row: PartnerRecord = { id: id("partner"), createdAt: new Date(), ...input };
    this.partners.push(row);
    return row;
  }
  async findReferralByWorkspace(workspaceId: string) { return this.referrals.find((r) => r.workspaceId === workspaceId) ?? null; }
  async createReferral(input: { partnerId: string; workspaceId: string; commissionUntil: Date }) {
    if (this.referrals.some((r) => r.workspaceId === input.workspaceId)) throw new Error("unique constraint");
    const row: ReferralRecord = { id: id("referral"), createdAt: new Date(), ...input };
    this.referrals.push(row);
    return row;
  }
  async findReferralsForPartner(partnerId: string) { return this.referrals.filter((r) => r.partnerId === partnerId); }
  async createCommission(input: Omit<CommissionRecord, "id" | "createdAt" | "paidOutAt">) {
    const existing = this.commissions.find((c) => c.sourceId === input.sourceId);
    if (existing) return { commission: existing, created: false };
    const row: CommissionRecord = { id: id("commission"), createdAt: new Date(), paidOutAt: null, ...input };
    this.commissions.push(row);
    return { commission: row, created: true };
  }
  async findCommissionsForPartner(partnerId: string) { return this.commissions.filter((c) => c.partnerId === partnerId); }
}
