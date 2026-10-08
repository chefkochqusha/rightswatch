import type { SubscriptionStatus } from "@/modules/billing";

/**
 * UI-safe copy for `SubscriptionStatus` — same reasoning as
 * `components/rights/labels.ts` and `components/cases/labels.ts`: the
 * domain module never needs to know about display strings.
 */
export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIALING: "Free trial",
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  CANCELED: "Canceled",
};

const wholeEuros = new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const withCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `priceCents` -> "€99", or "€209.30" when there are cents (discounted prices, commissions). */
export function formatPlanPrice(priceCents: number): string {
  return (priceCents % 100 === 0 ? wholeEuros : withCents).format(priceCents / 100);
}

/** Covers the exact example values named in `Plan.scanCadence`'s schema
 *  comment ("daily" | "every_6h" | "configurable") — a plan with a cadence
 *  outside that set falls back to showing the raw string. */
export const SCAN_CADENCE_LABELS: Record<string, string> = {
  daily: "Daily",
  every_6h: "Every 6 hours",
  configurable: "Configurable",
};
