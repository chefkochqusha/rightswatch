import { getPrisma } from "@/lib/prisma-client";
import { getAuthStore } from "./auth-store";
import { getBillingStore } from "./billing-store";

/**
 * The plan's limits besides creators (`creator-allowance.ts`): team seats
 * and songs with reference audio. A workspace without a live plan (none
 * chosen yet, or cancelled) gets the owner's seat and no reference audio.
 */
export interface PlanLimits {
  planName: string | null;
  seatCap: number;
  referenceSongCap: number;
}

export async function getPlanLimits(workspaceId: string): Promise<PlanLimits> {
  const billing = getBillingStore();
  const subscription = await billing.subscriptions.findByWorkspaceId(workspaceId);
  const plan = subscription && subscription.status !== "CANCELED" ? await billing.plans.findById(subscription.planId) : null;
  return plan
    ? { planName: plan.name, seatCap: plan.seatCap, referenceSongCap: plan.referenceSongCap }
    : { planName: null, seatCap: 1, referenceSongCap: 0 };
}

/** Whether one more member fits, and a sentence saying why not. */
export async function seatCheck(workspaceId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const [limits, members] = await Promise.all([getPlanLimits(workspaceId), getAuthStore().memberships.findForWorkspace(workspaceId)]);
  if (members.length < limits.seatCap) return { ok: true };
  return {
    ok: false,
    message: limits.planName
      ? `${limits.planName} includes ${limits.seatCap} ${limits.seatCap === 1 ? "seat" : "seats"}, and all are taken. A bigger plan adds more.`
      : "Choose a plan to invite your team. Every plan starts with a free trial.",
  };
}

/** Whether another song may get reference audio (replacing a song's own doesn't count). */
export async function referenceSongCheck(workspaceId: string, trackId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const [limits, used, own] = await Promise.all([
    getPlanLimits(workspaceId),
    getPrisma().trackFingerprint.count({ where: { workspaceId } }),
    getPrisma().trackFingerprint.count({ where: { workspaceId, musicTrackId: trackId } }),
  ]);
  if (own > 0 || used < limits.referenceSongCap) return { ok: true };
  return {
    ok: false,
    message: limits.planName
      ? `${limits.planName} includes reference audio for ${limits.referenceSongCap.toLocaleString("en-US")} songs, and all are used. Remove one or move to a bigger plan.`
      : "Choose a plan to add reference audio. Every plan starts with a free trial.",
  };
}
