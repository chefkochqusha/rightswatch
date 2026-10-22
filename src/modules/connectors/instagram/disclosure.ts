/**
 * Whether an Instagram caption marks the post as advertising.
 *
 * Instagram's API has no field for the "Paid partnership" label on another
 * account's post (checked against the IG Media reference, 2026-10-22), so the
 * connector reads the caption instead. In Germany a paid post has to say so
 * in words (§ 5a (4) UWG, § 22 MStV); the media authorities' guide asks for
 * "Werbung" or "Anzeige" at the start, and creators abroad use "#ad",
 * "sponsored" and their own languages' terms. A post whose caption says none
 * of these isn't picked up by a scan; it can still be added by hand.
 *
 * Deliberately not a guess at whether the post *is* paid: it records which
 * words the creator used, and the post's page shows them.
 */
const WORD_BEFORE = String.raw`(?:^|[^\p{L}\p{N}])`;
const WORD_AFTER = String.raw`(?![\p{L}\p{N}])`;
const word = (body: string) => new RegExp(`${WORD_BEFORE}(?:${body})${WORD_AFTER}`, "iu");

const TERMS: RegExp[] = [
  // German
  word("#?(?:werbung|anzeige|werbevideo|produktplatzierung|reklame)"),
  word("bezahlte partnerschaft|in kooperation mit|#kooperation"),
  // English
  word("#(?:ad|ads|advert|advertisement|sponsored|spon|paidpartnership)"),
  word("paid partnership|sponsored by|in paid partnership with"),
  /(?:^|[^\p{L}\p{N}])[[(](?:ad|advert|sponsored)[\])]/iu,
  // French, Spanish, Italian, Dutch, Nordic
  word("#?(?:publicité|sponsorisé|partenariat rémunéré|publicidad|patrocinado|pubblicità|sponsorizzato|advertentie|samarbeid|samarbete|reklam)"),
  word("#(?:publi|adv)"),
];

export interface Disclosure {
  /** The words as the creator wrote them, e.g. "Werbung" or "#ad". */
  term: string;
  /** What the post's page shows as its label. */
  label: string;
}

export function captionDisclosure(caption: unknown): Disclosure | null {
  if (typeof caption !== "string" || caption.length === 0) return null;
  const text = caption.slice(0, 5000);
  for (const pattern of TERMS) {
    const match = pattern.exec(text);
    if (match) {
      let term = match[0].replace(/^[^\p{L}\p{N}#[(]+/u, "").trim();
      // "[Werbung]": the bracket before the word was only its boundary.
      if (/^[[(]/.test(term) && !/[\])]$/.test(term)) term = term.slice(1);
      return { term, label: `Labelled as an ad in the caption ("${term}")` };
    }
  }
  return null;
}
