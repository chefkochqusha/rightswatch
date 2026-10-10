# Rechtstexte: Entwürfe für die anwaltliche Prüfung

**Stand: 10.10.2026. Alles in diesem Ordner ist ein Entwurf, keine Rechtsberatung.**
Geschrieben aus dem Code und den Recherchen in `LEGAL_DE.md`, damit die Anwältin
oder der Anwalt nicht bei null anfängt, sondern prüft, streicht und ergänzt.
Nichts davon darf ungeprüft an Kunden gehen.

| Datei | Was | Wo es später steht |
|---|---|---|
| `impressum.md` | Anbieterkennzeichnung (§ 5 DDG) plus DSA-Kontaktstellen (Art. 11, 12 DSA) | `/imprint`; die Seite füllt sich aus Umgebungsvariablen (`IMPRESSUM_*`, siehe `.env.example`) |
| `datenschutzerklaerung.md` | Datenschutzerklärung (Art. 13 DSGVO) für Website, Konten und Abrechnung, in denen Bekvor Verantwortlicher ist | `/privacy` (englische Fassung auf der Seite, diese hier ist die Vorlage) |
| `agb.md` | AGB für Unternehmer (B2B), inklusive Upload-Regeln (Art. 14 DSA), Meldeverfahren (Art. 16 DSA) und Anbieterwechsel (Data Act) | Bei Vertragsschluss (Checkout) einbinden; Seite `/terms` nach Freigabe |
| `avv.md` | Auftragsverarbeitungsvertrag (Art. 28 DSGVO) mit Anlagen: Verarbeitungen, TOM, Unterauftragsverarbeiter | Teil der AGB (Anlage), abrufbar im Konto |

Partnerbedingungen: bereits als Entwurf auf `/partner-terms` (Code).

## Was der Inhaber vorher liefern muss

- Rechtsform und Firma (Einzelunternehmen, UG, GmbH), ladungsfähige Anschrift
  (kein Postfach), vertretungsberechtigte Person, Registergericht und -nummer
  (falls eingetragen), USt-IdNr. oder Wirtschafts-IdNr. (die Steuernummer gehört
  nicht ins Impressum).
- Eine Telefonnummer oder ein anderer zweiter schneller Kontaktweg neben der
  E-Mail (IHK Aachen, Stand April 2026).
- Hosting-Entscheidung: eigener EU-Server oder Vercel (bestimmt die
  Empfängerliste in Datenschutzerklärung und AVV).
- E-Mail-Dienst (SMTP-Anbieter) und Datenbank-Anbieter mit Sitz und Region.
- Ob Bekvor an Verbraucherschlichtung teilnimmt (§ 36 VSBG; Kleinstunternehmen
  bis 10 Beschäftigte sind von der Hinweispflicht ausgenommen; bei reinem B2B
  ohnehin kaum relevant).

## Fragen an die Anwältin / den Anwalt

1. **Rolle bei Kundendaten:** Wir gehen davon aus, dass Bekvor für die Daten in
   den Arbeitsbereichen (Creator, Posts, hochgeladene Videos) Auftragsverarbeiter
   ist und für Konten, Abrechnung und Website Verantwortlicher. Stimmt das, auch
   für die automatische Abfrage öffentlicher TikTok-Daten, die Bekvor selbst
   anstößt?
2. **Uploads und Urheberrecht:** Reicht die Rechtegarantie des Kunden (AGB § 6)
   für das Vervielfältigen beim Einlesen (§ 16 UrhG)? Deckt § 44b UrhG das
   Analysieren von Post-Videos, die der Kunde hochlädt?
3. **DSA:** Bekvor speichert Uploads im Auftrag der Kunden und ist damit
   Hostingdiensteanbieter. Die Bundesnetzagentur nennt für Hostingdienste keine
   Ausnahme für Kleinstunternehmen bei Art. 11–18; den Transparenzbericht
   (Art. 15) erlässt Art. 15 Abs. 2 kleinen Unternehmen. Bitte bestätigen, und ob
   die Uploads, die niemand außer dem Kunden sieht und die nach dem Einlesen
   gelöscht werden, daran etwas ändern.
4. **Haftung:** Die Klausel in AGB § 10 erklärt „wesentliche Vertragspflichten“
   abstrakt, weil der Begriff allein intransparent ist (OLG Celle, 11 U 78/08,
   unter Berufung auf BGH NJW-RR 2005, 1496). Ist die Höchstsumme (Jahresentgelt,
   mindestens ein fester Betrag) für den vertragstypischen Schaden ausreichend?
5. **Data Act:** Kündigung und Wechsel (AGB § 13) sind nach Art. 25 aufgebaut.
   Dürfen bei Jahresverträgen Restentgelte bis zum Laufzeitende verlangt werden,
   wenn der Kunde vorzeitig wechselt (Kündigungsentgelt vs. Wechselentgelt nach
   Art. 29)?
6. **Treuepreis:** Der Monatspreis sinkt mit jedem Monat (−10 % ab Monat 2, dann
   je −2 %, bis −30 % ab Monat 12). Ist das in den AGB und auf der Preisseite so
   klar genug, und was gilt bei Planwechsel?
7. **B2B-Nachweis:** Reicht die Bestätigung bei der Registrierung plus Abfrage
   von Firma und USt-IdNr. im Checkout, damit Verbraucherrecht (Widerrufsrecht,
   Widerrufsbutton, BFSG, PAngV) nicht greift?
8. **US-Anbieter:** Reicht das EU-US Data Privacy Framework (beim EuGH
   angegriffen, Stand siehe `DATA_FLOWS.md`) für Vercel, Stripe und ggf. den
   E-Mail-Dienst, oder sollen zusätzlich Standardvertragsklauseln vereinbart
   werden?
9. **Sprache:** Die Seite ist englisch. Sollen AGB und AVV zweisprachig sein,
   und welche Fassung geht vor?

## Geprüfte Quellen (Oktober 2026)

- Impressum: IHK Aachen, „Impressumspflicht im Internet“, Stand April 2026
  (§ 5 DDG, Telefon als zweiter Kontaktweg, USt-IdNr./W-IdNr., OS-Plattform am
  20.07.2025 eingestellt, VSBG).
- DSA: Bundesnetzagentur, „Pflichten der Vermittlungsdienste“ (Art. 11–18 für
  Hostingdienste; Inhalte einer Meldung nach Art. 16; Begründung nach Art. 17).
- Data Act: IT-Recht Kanzlei, „EU-Data Act: Update für Hosting- und SaaS-AGB
  erforderlich“, 22.10.2025 (Art. 25 Pflichtklauseln, Fristen, Art. 29
  Wechselentgelte bis 11.01.2027, danach keine).
- Digital Omnibus: Haufe Gesetzesradar: Kommissionsvorschlag vom 19.11.2025,
  noch nicht verabschiedet; die DSGVO gilt unverändert.
- AVV: legiscope, „AVV-Muster“, Quellen geprüft am 29.09.2026 (Pflichtinhalt
  Art. 28 Abs. 3, Unterauftragsverarbeiter Art. 28 Abs. 2 und 4).
- Haftung B2B: WBS (2013) und OLG Celle 11 U 78/08 (2008); **ältere Quellen**,
  aktuelle Rechtsprechung muss die Anwältin / der Anwalt prüfen.
