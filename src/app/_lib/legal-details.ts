/**
 * The operator's details for the imprint (§ 5 DDG), the DSA contact points
 * (Art. 11, 12) and the privacy policy, read from the environment so the owner
 * fills them in the hosting settings, not in code. Drafts of the full legal
 * texts: `legal/`.
 *
 * The imprint only counts as complete with a name, a postal address, an email
 * and a second fast contact channel (a phone number): until then the pages say
 * so instead of showing half an imprint.
 */
export interface LegalDetails {
  /** Company name with legal form, or the owner's full name. */
  name: string;
  /** Postal address lines (no PO box). */
  address: string[];
  email: string;
  phone: string;
  /** Managing director(s), for a UG/GmbH. */
  representative: string | null;
  /** "Amtsgericht …, HRB …" when registered. */
  register: string | null;
  /** USt-IdNr. (or Wirtschafts-IdNr.); never the tax number. */
  vatId: string | null;
  /** DSA contact point and notice address; defaults to `email`. */
  dsaEmail: string;
  /** Data protection contact; defaults to `email`. */
  privacyEmail: string;
  /** The supervisory authority responsible for the operator's seat. */
  supervisoryAuthority: string | null;
}

type Env = Record<string, string | undefined>;

function read(env: Env, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

/** The details, or `null` while a required one is missing. */
export function legalDetailsFromEnv(env: Env = process.env): LegalDetails | null {
  const name = read(env, "IMPRESSUM_NAME");
  const address = (read(env, "IMPRESSUM_ADDRESS") ?? "")
    .split(/\s*[|\n]\s*/)
    .map((line) => line.trim())
    .filter(Boolean);
  const email = read(env, "IMPRESSUM_EMAIL");
  const phone = read(env, "IMPRESSUM_PHONE");
  if (!name || address.length === 0 || !email || !phone) return null;
  return {
    name,
    address,
    email,
    phone,
    representative: read(env, "IMPRESSUM_REPRESENTATIVE"),
    register: read(env, "IMPRESSUM_REGISTER"),
    vatId: read(env, "IMPRESSUM_VAT_ID"),
    dsaEmail: read(env, "DSA_CONTACT_EMAIL") ?? email,
    privacyEmail: read(env, "PRIVACY_EMAIL") ?? email,
    supervisoryAuthority: read(env, "PRIVACY_SUPERVISORY_AUTHORITY"),
  };
}
