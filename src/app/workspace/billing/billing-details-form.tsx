"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { buttonStyles } from "@/components/ui/button";
import { saveBillingDetailsAction, type BillingDetailsState } from "./actions";

export interface BillingDetailsDefaults {
  companyName?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  postalCode?: string;
  city?: string;
  country?: string;
  vatId?: string | null;
}

/**
 * Company details for invoices. Keeps what was typed after a failed check
 * (the form remounts with the submitted values) and says what's wrong next to
 * the field.
 */
export function BillingDetailsForm({ defaults, countries }: { defaults: BillingDetailsDefaults; countries: { code: string; name: string; eu: boolean }[] }) {
  const [state, formAction, pending] = useActionState(saveBillingDetailsAction, {} as BillingDetailsState);
  const v = state.values ?? {};
  const value = (key: keyof BillingDetailsDefaults) => v[key] ?? defaults[key] ?? undefined;
  const e = state.fieldErrors ?? {};
  const countryError = e.country;

  return (
    <form key={state.attempt ?? 0} action={formAction} className="grid max-w-2xl gap-5">
      <FormField label="Company name" name="companyName" autoComplete="organization" defaultValue={value("companyName") ?? ""} error={e.companyName} hint="As it should appear on invoices, with the legal form." maxLength={200} />
      <FormField label="Street and number" name="addressLine1" autoComplete="address-line1" defaultValue={value("addressLine1") ?? ""} error={e.addressLine1} maxLength={200} />
      <FormField label="Address line 2" name="addressLine2" optional autoComplete="address-line2" defaultValue={value("addressLine2") ?? ""} error={e.addressLine2} maxLength={200} />
      <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
        <FormField label="Postal code" name="postalCode" autoComplete="postal-code" defaultValue={value("postalCode") ?? ""} error={e.postalCode} maxLength={20} />
        <FormField label="City" name="city" autoComplete="address-level2" defaultValue={value("city") ?? ""} error={e.city} maxLength={100} />
      </div>
      <div>
        <label htmlFor="country" className="block text-[0.8125rem] font-medium text-tx">
          Country
        </label>
        <select
          id="country"
          name="country"
          required
          autoComplete="country"
          defaultValue={value("country") ?? "DE"}
          aria-invalid={countryError ? true : undefined}
          aria-describedby={countryError ? "country-error" : undefined}
          className="mt-1.5 block h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm text-tx aria-invalid:border-mismatch"
        >
          <optgroup label="European Union">
            {countries.filter((c) => c.eu).map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </optgroup>
          <optgroup label="Other countries">
            {countries.filter((c) => !c.eu).map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </optgroup>
        </select>
        {countryError && (
          <p id="country-error" className="mt-1.5 text-[0.8125rem] text-mismatch">
            {countryError}
          </p>
        )}
      </div>
      <FormField
        label="VAT ID"
        name="vatId"
        optional
        autoComplete="off"
        placeholder="DE123456789"
        defaultValue={value("vatId") ?? ""}
        error={e.vatId}
        hint="Needed for businesses elsewhere in the EU (reverse charge). Optional in Germany and outside the EU."
        maxLength={20}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={pending} className={buttonStyles("primary")}>
          {pending ? "Saving…" : "Save company details"}
        </button>
        {state.saved && (
          <p role="status" className="text-[0.8125rem] text-cleared">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}
