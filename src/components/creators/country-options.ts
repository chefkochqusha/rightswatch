import { COUNTRY_CODES } from "@/modules/creators/countries";
import type { CountryOption } from "./country-select";
import { countryName } from "./labels";

let cached: CountryOption[] | null = null;

/** Every country, named and sorted by name — computed on the server, once,
 *  and handed to `CountrySelect` (see its doc comment for why). */
export function countryOptions(): CountryOption[] {
  cached ??= COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  );
  return cached;
}
