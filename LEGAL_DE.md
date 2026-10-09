# German and EU rules for the website and the service

A living register of the rules that apply to Bekvor as a website and B2B
SaaS operated from Germany: what applies, from when, what the product does about
it, and what the owner or the lawyer still has to do. **Re-check it before every
release and whenever a feature touches signup, checkout, pricing, invoices,
legal pages, cookies, emails, AI or uploads**, and add new rules here first.
Engineering notes, not legal advice: the lawyer and the tax advisor have the
last word.

Last checked: 2026-10-09 (product name changed to Bekvor; trademark and company search still open, see RELEASE_CHECKLIST.md).

## Applies now

| Rule | Since | What it means here | Status |
|---|---|---|---|
| **Impressum, § 5 DDG** (the DDG replaced the TMG in May 2024) | 2024 | Real name, address, contact, VAT ID on `/imprint`; cite the DDG, never the TMG | Page is a placeholder; fill with real details (owner, lawyer) |
| **OS platform link removed** | 20 Jul 2025 | The EU dispute-resolution platform was shut down and the duty to link to it ended: no OS link in imprint, terms or emails. A § 36 VSBG statement on consumer arbitration may still be needed (mainly for consumer business and companies with more than 10 staff) | No OS link anywhere in the code (checked). Lawyer decides on the VSBG line |
| **GDPR / TDDDG § 25** (cookies, device access) | — | Only the session cookie, which the login strictly needs, so no consent banner. Self-hosted fonts, no tracking, no session replay | Done; see `DATA_FLOWS.md`, `SECURITY.md` |
| **EU Data Act, cloud switching (Art. 23–31)** | 12 Sep 2025 | Applies to SaaS, B2B included. The contract must give the right to switch provider or move in-house, with a notice period of at most 2 months. The switch is normally done within 30 days, and the customer gets at least 30 days to fetch their data. Exportable data must be listed and offered in a common machine-readable format, with deletion after the switch. Switching fees: only actual cost until 11 Jan 2027, **none from 12 Jan 2027** | Export exists (Settings → "Download your data", JSON). To do: terms clauses (lawyer), no switching fees, keep the export complete |
| **Barrierefreiheitsstärkungsgesetz (BFSG)** | 28 Jun 2025 | Applies to services offered to consumers. Pure B2B is out of scope only if consumers *factually* cannot buy (a sentence in the terms is not enough). Micro-enterprises (fewer than 10 staff and at most €2 million turnover or balance sheet) are exempt for services | Most likely not applicable today (B2B, micro-enterprise). The site passes an automated WCAG 2.1 AA scan anyway. Checking a VAT ID at checkout would make "B2B only" factual |
| **E-invoices (B2B, domestic)** | Receiving: 1 Jan 2025 | Must be able to receive e-invoices (an email inbox is enough). A PDF is not an e-invoice | Owner: inbox ready |
| **Widerrufsbutton** (withdrawal button, EU 2023/2673) | 19 Jun 2026 | Consumer contracts concluded online need a permanently visible, clearly labelled withdrawal function. I could not confirm the status of the German implementing law | Only if consumers can sign up: keep it B2B-only, or build the button |
| **AI Act, Art. 50** (say it is an AI) | 2 Aug 2026 | Only if a chatbot or AI feature is added; none exists | Not applicable |

| **Partner programme: advertising labels and liability** (UWG § 5a, § 8 (2)) | — | Partners must label links as advertising ("Werbung"/"Anzeige"); a merchant can be liable for its affiliates' violations within its own programme. The draft terms require the label and forbid spam and fake reviews; breaking them ends the partnership | Built; lawyer to review `/partner-terms` |
| **Referral tracking without consent banner** (TDDDG § 25) | — | The partner code travels in the address and the signup form only; no cookie or local storage is set | Built (verified: no referral cookie) |
| **Price display for discounts** (PAngV) | — | The price rules (e.g. the 30-day lowest price for price reductions) protect consumers; Bekvor sells to businesses only. The loyalty and yearly discounts are stated as fixed terms next to the prices | Lawyer to confirm the B2B exemption and the wording |

## Coming

| Rule | From | What it means here | To do |
|---|---|---|---|
| **E-invoices, issuing (B2B, domestic)** | 1 Jan 2027 if 2026 turnover is above €800,000; otherwise **1 Jan 2028** | Invoices to German business customers must be structured e-invoices (XRechnung or ZUGFeRD), not PDFs. Not required for Kleinunternehmer (§ 19 UStG) or invoices up to €250 | Pick an invoicing route that issues ZUGFeRD/XRechnung (Stripe's PDF invoices alone are not enough) before the date that applies |
| **Data Act: no switching fees** | 12 Jan 2027 | See above | Never charge for leaving or for the export |
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
