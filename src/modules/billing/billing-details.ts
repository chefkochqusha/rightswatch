/**
 * A workspace's company details for billing: who the invoice is made out to
 * (§ 14 (4) UStG: the recipient's full name and address) and, for business
 * customers elsewhere in the EU, their VAT ID (§ 14a (1) UStG: reverse-charge
 * invoices carry both parties' VAT IDs). Asking for them before the first plan
 * is also how "businesses only" becomes something we check, not just a
 * sentence (LEGAL_DE.md, PAngV / BGH I ZR 99/08).
 *
 * Pure functions: the form, the checks and the tax situation they imply.
 * Whether a VAT ID really exists is checked by Stripe against the EU's VIES
 * register (`stripe-billing-details.ts`); here only its shape is checked.
 * The tax itself (rates, reverse-charge wording on invoices) is configured in
 * Stripe with the tax advisor, not decided by this code.
 */

/** EU member states and the prefix their VAT IDs start with (Greece uses EL). */
export const EU_VAT_PREFIX: Readonly<Record<string, string>> = {
  AT: "AT", BE: "BE", BG: "BG", HR: "HR", CY: "CY", CZ: "CZ", DK: "DK", EE: "EE", FI: "FI",
  FR: "FR", DE: "DE", GR: "EL", HU: "HU", IE: "IE", IT: "IT", LV: "LV", LT: "LT", LU: "LU",
  MT: "MT", NL: "NL", PL: "PL", PT: "PT", RO: "RO", SK: "SK", SI: "SI", ES: "ES", SE: "SE",
};

/** Our own country: domestic invoices with German VAT. */
export const HOME_COUNTRY = "DE";

/** Countries we bill outside the EU. Anywhere else: Enterprise, by hand. */
const OTHER_COUNTRIES = ["CH", "GB", "NO", "IS", "LI", "US", "CA", "AU"];

export const BILLING_COUNTRIES: readonly string[] = [...Object.keys(EU_VAT_PREFIX), ...OTHER_COUNTRIES];

export function isEuCountry(country: string): boolean {
  return country in EU_VAT_PREFIX;
}

/** Stripe's tax ID type for a country, where Stripe can store (and for the EU, check) one. */
export function stripeTaxIdType(country: string): "eu_vat" | "gb_vat" | "ch_vat" | "no_vat" | null {
  if (isEuCountry(country)) return "eu_vat";
  return ({ GB: "gb_vat", CH: "ch_vat", NO: "no_vat" } as const)[country as "GB" | "CH" | "NO"] ?? null;
}

/** "de 123 456-789" → "DE123456789". */
export function normalizeVatId(raw: string): string {
  return raw.toUpperCase().replace(/[\s.\-/]/g, "");
}

/**
 * Shape only: an EU VAT ID starts with its country's prefix and has 2–13
 * letters or digits after it. Whether the number exists is VIES's answer.
 */
export function vatIdShapeError(country: string, vatId: string): string | null {
  const prefix = EU_VAT_PREFIX[country];
  if (!prefix) return /^[A-Z0-9]{4,20}$/.test(vatId) ? null : "Use letters and digits only.";
  if (!vatId.startsWith(prefix)) return `A VAT ID from this country starts with ${prefix}.`;
  return /^[A-Z0-9]{2,13}$/.test(vatId.slice(prefix.length)) ? null : `Enter ${prefix} followed by your number, without spaces.`;
}

/**
 * How the invoice is taxed, for the explanation on the billing page:
 * - DOMESTIC: German customer, German VAT.
 * - EU_REVERSE_CHARGE: business elsewhere in the EU with a VAT ID; the
 *   customer accounts for the VAT (place of supply § 3a (2) UStG).
 * - OUTSIDE_EU: not taxable in Germany as a rule; the tax advisor confirms.
 */
export type TaxSituation = "DOMESTIC" | "EU_REVERSE_CHARGE" | "OUTSIDE_EU";

export function taxSituation(country: string): TaxSituation {
  if (country === HOME_COUNTRY) return "DOMESTIC";
  return isEuCountry(country) ? "EU_REVERSE_CHARGE" : "OUTSIDE_EU";
}

export interface BillingDetails {
  companyName: string;
  addressLine1: string;
  addressLine2: string | null;
  postalCode: string;
  city: string;
  /** ISO 3166-1 alpha-2, one of `BILLING_COUNTRIES`. */
  country: string;
  vatId: string | null;
}

export type BillingDetailsField = keyof BillingDetails;

export type ParseBillingDetailsResult =
  | { ok: true; details: BillingDetails }
  | { ok: false; errors: Partial<Record<BillingDetailsField, string>> };

const LIMITS: Record<Exclude<BillingDetailsField, "country" | "vatId">, number> = {
  companyName: 200,
  addressLine1: 200,
  addressLine2: 200,
  postalCode: 20,
  city: 100,
};

/** Reads and checks the billing-details form. */
export function parseBillingDetails(input: Partial<Record<BillingDetailsField, unknown>>): ParseBillingDetailsResult {
  const text = (key: BillingDetailsField) => (typeof input[key] === "string" ? (input[key] as string).trim().replace(/\s+/g, " ") : "");
  const errors: Partial<Record<BillingDetailsField, string>> = {};

  const companyName = text("companyName");
  const addressLine1 = text("addressLine1");
  const addressLine2 = text("addressLine2");
  const postalCode = text("postalCode");
  const city = text("city");
  const country = text("country").toUpperCase();
  const vatRaw = text("vatId");

  if (!companyName) errors.companyName = "Enter the company name as it should appear on invoices.";
  if (!addressLine1) errors.addressLine1 = "Enter the street and number.";
  if (!postalCode) errors.postalCode = "Enter the postal code.";
  if (!city) errors.city = "Enter the city.";
  for (const [key, max] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) {
    if (!errors[key] && text(key).length > max) errors[key] = `At most ${max} characters.`;
  }
  if (!BILLING_COUNTRIES.includes(country)) errors.country = "Choose a country from the list. For other countries, contact us.";

  const vatId = vatRaw ? normalizeVatId(vatRaw) : null;
  if (!errors.country) {
    if (vatId) {
      const shape = vatIdShapeError(country, vatId);
      if (shape) errors.vatId = shape;
    } else if (taxSituation(country) === "EU_REVERSE_CHARGE") {
      errors.vatId = "Business customers elsewhere in the EU need their VAT ID on the invoice.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    details: { companyName, addressLine1, addressLine2: addressLine2 || null, postalCode, city, country, vatId },
  };
}
