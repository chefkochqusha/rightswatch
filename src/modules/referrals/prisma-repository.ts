import { getPrisma } from "@/lib/prisma-client";
import type { CommissionRecord, ReferralRepository } from "./types";

export class PrismaReferralRepository implements ReferralRepository {
  findPartnerByUser(userId: string) {
    return getPrisma().referralPartner.findUnique({ where: { userId } });
  }
  findPartnerByCode(code: string) {
    return getPrisma().referralPartner.findUnique({ where: { code } });
  }
  createPartner(input: { userId: string; code: string; termsAcceptedAt: Date }) {
    return getPrisma().referralPartner.create({ data: input });
  }
  findReferralByWorkspace(workspaceId: string) {
    return getPrisma().referral.findUnique({ where: { workspaceId } });
  }
  createReferral(input: { partnerId: string; workspaceId: string; commissionUntil: Date }) {
    return getPrisma().referral.create({ data: input });
  }
  findReferralsForPartner(partnerId: string) {
    return getPrisma().referral.findMany({ where: { partnerId }, orderBy: { createdAt: "desc" } });
  }
  async createCommission(input: Omit<CommissionRecord, "id" | "createdAt" | "paidOutAt">) {
    const existing = await getPrisma().commission.findUnique({ where: { sourceId: input.sourceId } });
    if (existing) return { commission: existing, created: false };
    return { commission: await getPrisma().commission.create({ data: input }), created: true };
  }
  findCommissionsForPartner(partnerId: string) {
    return getPrisma().commission.findMany({ where: { partnerId }, orderBy: { earnedAt: "desc" } });
  }
}
