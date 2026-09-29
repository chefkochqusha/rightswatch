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

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
});

/** `priceCents` -> "€99" — whole-euro plans, so no decimals are shown. */
export function formatPlanPrice(priceCents: number): string {
  return priceFormatter.format(priceCents / 100);
}

/** Covers the exact example values named in `Plan.scanCadence`'s schema
 *  comment ("daily" | "every_6h" | "configurable") — a plan with a cadence
 *  outside that set falls back to showing the raw string. */
export const SCAN_CADENCE_LABELS: Record<string, string> = {
  daily: "Daily",
  every_6h: "Every 6 hours",
  configurable: "Configurable",
};
