# German and EU rules for the website and the service

A living register of the rules that apply to Bekvor as a website and B2B
SaaS operated from Germany: what applies, from when, what the product does about
it, and what the owner or the lawyer still has to do. **Re-check it before every
release and whenever a feature touches signup, checkout, pricing, invoices,
legal pages, cookies, emails, AI or uploads**, and add new rules here first.
Engineering notes, not legal advice: the lawyer and the tax advisor have the
last word.

Last checked: 2026-10-10 (legal drafts in `legal/` for the lawyer: imprint, privacy policy, terms, AVV; imprint and privacy pages built from env; service emails; uploads: DSA, copyright, GDPR; product name Bekvor).

## Applies now

| Rule | Since | What it means here | Status |
|---|---|---|---|
| **Impressum, § 5 DDG** (the DDG replaced the TMG in May 2024) | 2024 | Name (with legal form), postal address (no PO box), email **and a second fast channel, in practice a phone number**, representative and register for a UG/GmbH, VAT ID or Wirtschafts-IdNr. (never the tax number); cite the DDG, never the TMG. No § 18 MStV line while there is no editorial content. Fines up to €50,000 (IHK Aachen, April 2026) | Built: `/imprint` renders from `IMPRESSUM_*` env vars and shows a "before launch" note until name, address, email and phone are set. Draft: `legal/impressum.md`. Owner: fill the env vars; lawyer: review |
| **OS platform link removed** | 20 Jul 2025 | The EU dispute-resolution platform was shut down and the duty to link to it ended: no OS link in imprint, terms or emails. A § 36 VSBG statement on consumer arbitration may still be needed (mainly for consumer business and companies with more than 10 staff) | No OS link anywhere in the code (checked). Lawyer decides on the VSBG line |
| **GDPR / TDDDG § 25** (cookies, device access) | — | Only the session cookie, which the login strictly needs, so no consent banner. Self-hosted fonts, no tracking, no session replay | Done; see `DATA_FLOWS.md`, `SECURITY.md` |
| **EU Data Act, cloud switching (Art. 23–31)** | 12 Sep 2025 | Applies to SaaS, B2B included. The contract must give the right to switch provider or move in-house, with a notice period of at most 2 months. The switch is normally done within 30 days, and the customer gets at least 30 days to fetch their data. Exportable data must be listed and offered in a common machine-readable format, with deletion after the switch. Switching fees: only actual cost until 11 Jan 2027, **none from 12 Jan 2027** | Export exists (Settings → "Download your data", JSON). Drafted: switching, transition and retrieval periods, the list of exportable and excluded data, deletion, no fees (`legal/agb.md` § 13). To do: lawyer (fingerprints excluded from the export? remaining fees on yearly plans?), keep the export complete |
| **Barrierefreiheitsstärkungsgesetz (BFSG)** | 28 Jun 2025 | Applies to services offered to consumers. Pure B2B is out of scope only if consumers *factually* cannot buy (a sentence in the terms is not enough). Micro-enterprises (fewer than 10 staff and at most €2 million turnover or balance sheet) are exempt for services | Most likely not applicable today (B2B, micro-enterprise). The site passes an automated WCAG 2.1 AA scan anyway. Checking a VAT ID at checkout would make "B2B only" factual |
| **E-invoices (B2B, domestic)** | Receiving: 1 Jan 2025 | Must be able to receive e-invoices (an email inbox is enough). A PDF is not an e-invoice | Owner: inbox ready |
| **Widerrufsbutton** (withdrawal button, EU 2023/2673) | 19 Jun 2026 | Consumer contracts concluded online need a permanently visible, clearly labelled withdrawal function. I could not confirm the status of the German implementing law | Only if consumers can sign up: keep it B2B-only, or build the button |
| **AI Act, Art. 50** (say it is an AI) | 2 Aug 2026 | Only if a chatbot or AI feature is added; none exists | Not applicable |

| **Partner programme: advertising labels and liability** (UWG § 5a, § 8 (2)) | — | Partners must label links as advertising ("Werbung"/"Anzeige"); a merchant can be liable for its affiliates' violations within its own programme. The draft terms require the label and forbid spam and fake reviews; breaking them ends the partnership | Built; lawyer to review `/partner-terms` |
| **Referral tracking without consent banner** (TDDDG § 25) | — | The partner code travels in the address and the signup form only; no cookie or local storage is set | Built (verified: no referral cookie) |
| **Uploads make Bekvor a hosting service** (Digital Services Act, Art. 3(g)(iii), 11–17) | 17 Feb 2024 | Customers upload song recordings and post videos (own recognition, only on our own server). Storing them makes Bekvor a hosting service, whatever its size: points of contact for authorities and users (Art. 11, 12), content rules in the terms (Art. 14), an electronic way for anyone to report illegal content (Art. 16) and reasons when something is restricted (Art. 17). The yearly transparency report (Art. 15) does not apply to micro and small enterprises (Art. 15(2)). Uploads are never shown to anyone else and are deleted after reading, which keeps the practical risk low but doesn't remove the duties | Built: private uploads, deleted after reading, type and size checks; contact point and notice instructions (Art. 11, 12, 16) on `/imprint` (`DSA_CONTACT_EMAIL`). Drafted: upload rules, moderation, statement of reasons and Art. 18 in the terms (`legal/agb.md` § 7). The Bundesnetzagentur lists no micro-enterprise exemption for the Art. 11–18 hosting duties. To do: lawyer review, terms shown at checkout |
| **Copyright in uploaded recordings** (UrhG § 16, § 44b) | — | Reading a song to make a fingerprint copies it. Allowed when the customer holds the rights or is authorised; the upload form says so ("Only upload songs you hold the rights to or are authorised to manage"). Bekvor keeps only the fingerprint, not the recording. Whether § 44b (text and data mining) also covers analysing post videos a customer uploads is for the lawyer | Built: notice at the upload, recording deleted after reading. Drafted: rights warranty, licence to process and indemnity (`legal/agb.md` § 6). To do: lawyer |
| **Post videos contain personal data** (GDPR Art. 6, 28) | — | A post video shows the creator (face, voice). Bekvor processes it on the customer's behalf to check the music, as a processor: it must be in the AVV, with deletion after the check. Bekvor keeps the result (song, score), not the video | Built: deleted after the check, result only. Drafted: AVV Annex A and the privacy policy (`legal/avv.md`, `/privacy`). To do: lawyer |
| **Service emails** (UWG § 7, GDPR Art. 6(1)(b)) | — | Bekvor sends only service emails: confirm your address, password reset, "you already have an account", an invite a colleague asked for, and new cases (one email per run, to owners, admins and analysts, switchable off in Settings). Purely factual emails that serve the contract need no consent; any advertising in them (a newsletter prompt, a review request, social links, a discount) would turn them into advertising that needs consent. The texts contain none and must stay that way | Built (`modules/email/templates.ts`, tested for no extra content). Lawyer to confirm; never add marketing to these |
| **Price display for discounts and net prices** (PAngV; BGH I ZR 99/08) | — | The price rules (gross prices, the 30-day lowest price for reductions) protect consumers; Bekvor sells to businesses only. Net prices on a public page are only safe when the offer is **clearly limited to businesses and checked**: a statement alone isn't enough (BGH, 29.04.2010). The pricing section says "For businesses only; … plus VAT", signup needs the business confirmation, and plans now run from Solo (€29) to Agency (€999), Enterprise on request. Checked 2026-10-10 | Built: the notice, the signup confirmation and, **new 2026-10-10**, company name and address before the first plan, VAT ID required for EU customers outside Germany, checked by Stripe against VIES (billing page). To do: lawyer to confirm that this is enough of a check |
| **Invoice details and reverse charge** (§ 14 (4), § 14a (1), § 3a (2) UStG) | — | An invoice names the recipient with full name and address. A B2B service to a business elsewhere in the EU is taxed where the customer is: the invoice carries both VAT IDs and "Steuerschuldnerschaft des Leistungsempfängers" (or "Reverse charge"), no German VAT, and is due by the 15th of the following month; such sales go into the quarterly Zusammenfassende Meldung (not for Kleinunternehmer). A missing VAT ID doesn't make a customer a consumer, but must be clarified (kostenlose-erechnung.de, updated 06.10.2026) | Built: the details are collected and put on the Stripe customer (name, address, tax ID); Stripe reports the VIES result by webhook. **Not built and not decided by code:** tax rates and reverse-charge wording on Stripe invoices (Stripe Tax or manual tax rates), the ZM, invoices outside the EU. Owner with the tax advisor, before the first paid invoice |
| **Retention of accounting records** (§ 147 AO, Bürokratieentlastungsgesetz IV) | 1 Jan 2025 | Invoices and other accounting vouchers 8 years (was 10); books, annual statements, inventories still 10; business letters 6 | In the privacy policy (billing). Tax advisor to confirm |
| **Terms between businesses** (§§ 305–310 BGB) | — | Only § 307 applies to B2B terms, but §§ 308/309 are a strong hint. Liability for intent, gross negligence and injury can't be excluded; for slight negligence only for non-essential duties, and "essential duties" (Kardinalpflichten) must be explained in the clause or it isn't transparent (OLG Celle 11 U 78/08, citing BGH NJW-RR 2005, 1496). A cap must cover the typical, foreseeable damage | Drafted with an explained definition and a cap (`legal/agb.md` § 10). Sources are older: lawyer to check current case law |

## Coming

| Rule | From | What it means here | To do |
|---|---|---|---|
| **E-invoices, issuing (B2B, domestic)** | 1 Jan 2027 if 2026 turnover is above €800,000; otherwise **1 Jan 2028** | Invoices to German business customers must be structured e-invoices (XRechnung or ZUGFeRD), not PDFs. Not required for Kleinunternehmer (§ 19 UStG) or invoices up to €250 | Pick an invoicing route that issues ZUGFeRD/XRechnung (Stripe's PDF invoices alone are not enough) before the date that applies |
| **Data Act: no switching fees** | 12 Jan 2027 | See above | Never charge for leaving or for the export |
| **Digital Omnibus** (GDPR, ePrivacy, Data Act changes) | Not adopted: Commission proposal of 19 Nov 2025; Parliament and Council not done, no date (Haufe) | Would e.g. widen the Art. 13(4) exception to information duties. Until it is in force, the GDPR applies unchanged | Re-check before each release |
| **New Product Liability (EU 2024/2853, German implementation)** | 9 Dec 2026 | Software counts as a product. Strict liability covers damage to private persons (injury, private property, loss of private data), so pure B2B use is mostly outside it | Lawyer: check the terms' liability clauses against it |

## Not relevant to this product (noted so nobody re-checks them)

Product safety (GPSR), packaging (VerpackG / PPWR), ElektroG, right to repair,
green claims / EmpCo (no environmental claims are made), BNPL / consumer
credit, EUDR, CBAM. These matter for a shop selling physical goods.

## Sources

- IHK Bayreuth, OS link: https://www.ihk.de/bayreuth/hauptnavigation/service/recht/allgemeine-rechtsthemen/anpassung-des-internet-impressums-erforderlich--6512524
- IT-Recht Kanzlei, Data Act and SaaS terms: https://www.it-recht-kanzlei.de/update-agb-hosting-saas-eu-data-act.html
- Xictron, BFSG B2B and micro-enterprises: https://www.xictron.com/de/blog/bfsg-ausnahmen-kleinstunternehmen-b2b-2026/
- IHK Stuttgart, e-invoices: https://www.ihk.de/stuttgart/fuer-unternehmen/recht-und-steuern/steuerrecht/steuermeldungen/e-rechnungen-5864496
- Händlerbund, changes in 2026: https://www.haendlerbund.de/de/ratgeber/recht/gesetzesaenderungen-2026
- IHK Nürnberg, Widerrufsbutton: https://www.ihk-nuernberg.de/meldungen/details/widerrufsbutton-wird-pflicht
- AI Act Art. 50: https://artificialintelligenceact.eu/article/50/
- IT-Recht Kanzlei, net prices for businesses (BGH I ZR 99/08): https://www.it-recht-kanzlei.de/werbung-netto-preise-b2b.html
- IT-Recht Kanzlei, advertising in transactional emails (updated 08.04.2025): https://www.it-recht-kanzlei.de/werbung-in-abwicklungsmails-systemmails-abmahnbar.html
- DSA duties by provider type and size (YPOG): https://www.ypog.law/en/insight/digital-services-act
- DSA Art. 15(2), small-enterprise exemption: https://www.springlex.eu/en/packages/dsa/dsa-regulation/article-15/
- DSA Art. 16, notice and action: https://presencis.com/regulations/dsa/article-16/
- IHK Aachen, imprint duties (April 2026): https://www.ihk.de/aachen/recht/rechtsinformationen/aktuelle-dokumente-zum-thema-recht/impressumspflicht-im-internet-607352
- Bundesnetzagentur, duties of intermediary services (DSA): https://www.bundesnetzagentur.de/DE/Fachthemen/DSC/1_Themen/PflichtenVermittlunggsdienste/artikel.html
- Haufe Gesetzesradar, Digital Omnibus status: https://www.haufe.de/id/beitrag/gesetzesradar-22-digital-omnibus-HI17242140.html
- legiscope, AVV contents (sources checked 29.09.2026): https://www.legiscope.com/blog/auftragsverarbeitungsvertrag-avv-muster.html
- Lexware, retention periods after BEG IV (updated 22.07.2026): https://www.lexware.de/wissen/buchhaltung-finanzen/buerokratieentlastungsgesetz/
- ra-kotz.de, Kardinalpflichten must be explained (OLG Celle 11 U 78/08): https://www.ra-kotz.de/agb_klausel_kardinalspflichten.htm
- kostenlose-erechnung.de, reverse-charge invoices (updated 06.10.2026): https://kostenlose-erechnung.de/ratgeber/reverse-charge-rechnung-erstellen/
- Stripe tax ID verification statuses: the installed SDK's `TaxId.Verification` type (`pending`, `verified`, `unverified`, `unavailable`); API reference https://docs.stripe.com/api/tax_ids/object
- WBS, liability limits between businesses (2013): https://www.wbs.legal/allgemein/haftungsbeschrankung-in-agb-zwischen-unternehmern-14364/
