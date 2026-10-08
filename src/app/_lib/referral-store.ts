import type { ReferralRepository } from "@/modules/referrals";
import { PrismaReferralRepository } from "@/modules/referrals/prisma-repository";

/** The partner programme's data, in Postgres — one shared store per server process. */
const globalForReferrals = globalThis as unknown as { __rightswatchReferralStore?: { referrals: ReferralRepository } };

export function getReferralStore(): { referrals: ReferralRepository } {
  globalForReferrals.__rightswatchReferralStore ??= { referrals: new PrismaReferralRepository() };
  return globalForReferrals.__rightswatchReferralStore;
}
