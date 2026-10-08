import type { PlanRecord } from "./types";

/**
 * Loyalty pricing: the longer a workspace stays subscribed, the less it pays.
 * Month 1 is full price, month 2 is 10 % off, then 2 % more every month up to
 * 30 % off from month 12 on. Annual billing gets the full 30 % from the start
 * (paid upfront for twelve months). Cancelling and coming back starts again at
 * month 1. The numbers live here and nowhere else.
 */
export const LOYALTY = {
  firstStepMonth: 2,
  firstStepPercent: 10,
  stepPercent: 2,
  maxPercent: 30,
  annualPercent: 30,
} as const;

export type BillingInterval = "MONTHLY" | "ANNUAL";

/** Discount in percent for the n-th month of an unbroken monthly subscription (1-based). */
export function loyaltyPercent(month: number): number {
  if (!Number.isFinite(month) || month < LOYALTY.firstStepMonth) return 0;
  const steps = Math.floor(month) - LOYALTY.firstStepMonth;
  return Math.min(LOYALTY.maxPercent, LOYALTY.firstStepPercent + steps * LOYALTY.stepPercent);
}

/** The first month that reaches the maximum discount (12 with the numbers above). */
export function monthOfMaxDiscount(): number {
  return LOYALTY.firstStepMonth + Math.ceil((LOYALTY.maxPercent - LOYALTY.firstStepPercent) / LOYALTY.stepPercent);
}

/**
 * Which month of loyalty `now` falls in: month 1 starts when the loyalty clock
 * starts (the end of the free trial), month 2 one calendar month later, and so on.
 * Before the clock starts it is month 1.
 */
export function loyaltyMonth(startedAt: Date | null, now: Date): number {
  if (!startedAt || now <= startedAt) return 1;
  let months = (now.getUTCFullYear() - startedAt.getUTCFullYear()) * 12 + (now.getUTCMonth() - startedAt.getUTCMonth());
  if (now.getUTCDate() < startedAt.getUTCDate()) months -= 1;
  return Math.max(1, months + 1);
}

/** Start of month `n` counted from `startedAt` (n = 1 is `startedAt` itself). */
export function startOfLoyaltyMonth(startedAt: Date, n: number): Date {
  const d = new Date(startedAt);
  d.setUTCMonth(d.getUTCMonth() + (n - 1));
  return d;
}

/** Net monthly price in cents for a plan, interval and loyalty month (annual: per month, billed yearly). */
export function monthlyPriceCents(plan: Pick<PlanRecord, "priceCents">, interval: BillingInterval, month: number): number {
  const percent = interval === "ANNUAL" ? LOYALTY.annualPercent : loyaltyPercent(month);
  return Math.round((plan.priceCents * (100 - percent)) / 100);
}

/** What an annual subscription is billed once a year, in cents. */
export function annualPriceCents(plan: Pick<PlanRecord, "priceCents">): number {
  return monthlyPriceCents(plan, "ANNUAL", 1) * 12;
}

/** Where a subscription stands: today's discount and the next step, if any. */
export function loyaltyStatus(
  sub: { billingInterval: BillingInterval; loyaltyStartedAt: Date | null },
  now: Date,
): { percent: number; month: number; next: { percent: number; from: Date } | null } {
  if (sub.billingInterval === "ANNUAL") return { percent: LOYALTY.annualPercent, month: 1, next: null };
  const month = loyaltyMonth(sub.loyaltyStartedAt, now);
  const percent = loyaltyPercent(month);
  if (percent >= LOYALTY.maxPercent || !sub.loyaltyStartedAt) return { percent, month, next: null };
  const nextMonth = month + 1;
  return { percent, month, next: { percent: loyaltyPercent(nextMonth), from: startOfLoyaltyMonth(sub.loyaltyStartedAt, nextMonth) } };
}
