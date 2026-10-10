# Datenschutzerklärung (Entwurf)

> Entwurf vom 10.10.2026 für die anwaltliche Prüfung, aufgebaut nach Art. 13
> DSGVO und geschrieben aus dem Code (`DATA_FLOWS.md`). Platzhalter in `[[…]]`.
> Abschnitte mit **[Variante]** hängen von der Hosting-Entscheidung ab.
> Die DSGVO gilt unverändert; der „Digital Omnibus“ ist nur ein Vorschlag
> (Kommission, 19.11.2025, noch nicht verabschiedet).

## 1. Wer verantwortlich ist

[[Firma, Anschrift, E-Mail, Telefon wie im Impressum]]

Einen Datenschutzbeauftragten haben wir nicht benannt, weil wir dazu nicht
verpflichtet sind (Art. 37 DSGVO, § 38 BDSG). *[Anwalt prüfen, sobald 20 Personen
ständig mit personenbezogenen Daten arbeiten.]*

## 2. Für welche Daten diese Erklärung gilt

Diese Erklärung betrifft die Daten, über die **wir** entscheiden: Besuche der
Website, Ihr Benutzerkonto, die Abrechnung, Service-E-Mails und das
Partnerprogramm.

Die Inhalte, die unsere Kunden in ihrem Arbeitsbereich verwalten (Creator auf
der Beobachtungsliste, deren Posts, hochgeladene Aufnahmen und Videos, Fälle,
Notizen), verarbeiten wir **im Auftrag des jeweiligen Kunden** (Art. 28 DSGVO).
Verantwortlich dafür ist der Kunde. Wenn Sie als Creator Fragen dazu haben,
wenden Sie sich bitte an das Unternehmen, das Sie beobachtet; wir leiten
Anfragen, die bei uns eingehen, an den Kunden weiter.

## 3. Besuch der Website

**Was:** IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, Browser-Angaben
(User-Agent), Referrer, übertragene Datenmenge, Statuscode.
**Wozu:** Die Seite ausliefern, Fehler finden, Angriffe und Missbrauch abwehren.
**Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem
sicheren, funktionierenden Angebot).
**Wie lange:** Server-Protokolle [[Variante Vercel: nach den Fristen des
Hosting-Anbieters, derzeit [[x]] Tage / Variante eigener Server: 14 Tage]].

Wir setzen **keine Analyse-, Tracking- oder Werbewerkzeuge** ein, keine
Social-Media-Plugins und laden keine Schriften oder Skripte von fremden Servern
nach. Schriften liegen auf unserem eigenen Server.

## 4. Cookies

Wir setzen ein einziges Cookie: das **Sitzungs-Cookie**, wenn Sie sich anmelden
oder die Demo öffnen. Es enthält eine zufällige Kennung und hält Sie angemeldet
(höchstens 7 Tage). Es ist für den von Ihnen gewünschten Dienst unbedingt
erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG), daher brauchen wir keine Einwilligung.
Rechtsgrundlage der anschließenden Verarbeitung: Art. 6 Abs. 1 lit. b DSGVO.

Ein Partner-Code aus einem Empfehlungslink wird nur in der Adresse und im
Registrierungsformular weitergegeben, nicht in einem Cookie oder im
Browser-Speicher.

## 5. Benutzerkonto

**Was:** E-Mail-Adresse, Name (freiwillig), Passwort (nur als Hash mit scrypt
gespeichert, nie im Klartext), Rolle im Arbeitsbereich, Name des Arbeitsbereichs,
Bestätigung, dass Sie für ein Unternehmen handeln und volljährig sind,
Anmeldezeitpunkte, Sitzungen, Einträge im Aktivitätsprotokoll des
Arbeitsbereichs.
**Wozu:** Konto anlegen, Anmeldung, Rechte im Team, Nachvollziehbarkeit
innerhalb des Arbeitsbereichs.
**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO (Vertrag); für das
Aktivitätsprotokoll und die Missbrauchsabwehr (Begrenzung von Anmelde- und
Registrierungsversuchen) Art. 6 Abs. 1 lit. f DSGVO. Für die Begrenzung speichern
wir nur einen nicht umkehrbaren Code (HMAC) aus E-Mail-Adresse und IP-Adresse,
der nach einem Tag ohne weitere Versuche gelöscht wird.
**Wie lange:** Bis Sie Ihr Konto löschen oder der Arbeitsbereich gelöscht wird.
Danach bleiben Daten bis zu [[7]] Tage in den Sicherungen des Datenbankanbieters,
bis diese überschrieben werden. Notizen und Protokolleinträge bleiben beim
Arbeitsbereich, ohne Ihren Namen.

Wenn Sie zu einem Arbeitsbereich eingeladen werden, erhalten wir Ihre
E-Mail-Adresse von der Person, die Sie einlädt.

## 6. Service-E-Mails

Wir senden nur E-Mails, die zum Dienst gehören: Adressbestätigung,
Passwort-Zurücksetzung, Hinweis „Sie haben bereits ein Konto“, Einladungen, die
ein Teammitglied angestoßen hat, und Hinweise auf neue Fälle (abschaltbar in den
Einstellungen). Keine Werbung, keine Newsletter, keine Öffnungs- oder
Klickverfolgung.
**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b DSGVO; für Einladungen Art. 6 Abs. 1
lit. f DSGVO (Interesse des Kunden, sein Team einzuladen).
**Empfänger:** unser E-Mail-Versanddienst [[Anbieter, Sitz]] als
Auftragsverarbeiter.

## 7. Abrechnung

**Was:** Firma, Rechnungsanschrift, USt-IdNr., E-Mail, gebuchter Plan,
Zahlungsstatus, Rechnungen. Kartendaten gehen direkt an den Zahlungsdienstleister,
wir sehen sie nicht.
**Wozu:** Vertrag abrechnen, Steuerpflichten erfüllen, Unternehmereigenschaft
prüfen.
**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b und lit. c DSGVO (§ 147 AO, § 257 HGB).
**Empfänger:** Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Dublin 2,
Irland. Stripe ist für die Zahlungsabwicklung teils selbst verantwortlich;
Daten können an Stripe, Inc. (USA) gehen, die nach dem EU-US Data Privacy
Framework zertifiziert ist. *[Anwalt: Rollen und Stripe-DPA prüfen.]*
**Wie lange:** Rechnungen und Buchungsbelege 8 Jahre, Handels- und
Geschäftsbriefe 6 Jahre (§ 147 AO in der seit 2025 geltenden Fassung, § 257 HGB).
*[Anwalt / Steuerberatung: Fristen bestätigen.]*

## 8. Partnerprogramm

**Was:** Ihr Partner-Code, welche Arbeitsbereiche über ihn entstanden sind,
Provisionen (Betrag, Rechnungsbezug, Auszahlungsdatum), Ihre Auszahlungs- und
Steuerangaben.
**Rechtsgrundlage:** Art. 6 Abs. 1 lit. b und lit. c DSGVO.
**Wie lange:** Wie Abrechnungsdaten (Abschnitt 7).

## 9. Kontakt per E-Mail

Wenn Sie uns schreiben, verarbeiten wir Ihre Nachricht und Ihre Angaben, um zu
antworten (Art. 6 Abs. 1 lit. b DSGVO bei Vertragsbezug, sonst lit. f), und
löschen sie, wenn die Sache erledigt ist und keine Aufbewahrungspflicht besteht.
Meldungen nach dem Digital Services Act bewahren wir auf, solange das Verfahren
läuft und für Nachweise [[12 Monate]] danach (Art. 6 Abs. 1 lit. c DSGVO).

## 10. Song-Suche

Wenn Sie im Rechte-Katalog nach einem Song suchen, schickt **unser Server** den
Suchtext an MusicBrainz (MetaBrainz Foundation, USA) und lädt Cover über das
Cover Art Archive (Internet Archive, USA). Ihre IP-Adresse oder Ihr Konto gehen
dabei nicht mit. Geben Sie in die Suche keine personenbezogenen Daten ein.

## 11. Hosting und Datenbank

**[Variante eigener Server]** Website, Anwendung, Datenbank und Uploads laufen
auf unserem Server bei [[Anbieter, Sitz, Rechenzentrum in der EU]], der als
Auftragsverarbeiter für uns tätig ist.

**[Variante Vercel]** Die Website und die Anwendung werden von Vercel Inc.,
440 N Barranca Ave #4133, Covina, CA 91723, USA, ausgeliefert
(Funktionsregion [[Frankfurt]]). Vercel ist nach dem EU-US Data Privacy Framework
zertifiziert (Art. 45 DSGVO). Die Datenbank betreibt [[Neon, Inc., USA, Region …]].

Mit allen Anbietern bestehen Verträge zur Auftragsverarbeitung (Art. 28 DSGVO).

## 12. Übermittlung in Drittländer

Soweit Anbieter in den USA sitzen (Abschnitte 7, 10, 11), stützen wir die
Übermittlung auf den Angemessenheitsbeschluss zum EU-US Data Privacy Framework
(Art. 45 DSGVO) [[und ergänzend auf Standardvertragsklauseln, Art. 46 Abs. 2
lit. c DSGVO]]. Der Beschluss ist vor dem Gerichtshof der EU angegriffen.

## 13. Keine automatisierten Entscheidungen

Bekvor erkennt Songs in Posts und vergleicht sie mit den Rechte-Einträgen des
Kunden. Das Ergebnis ist ein Hinweis zur Prüfung durch einen Menschen, keine
Entscheidung mit rechtlicher Wirkung für Sie (Art. 22 DSGVO). Wir setzen keine
KI-Sprachmodelle ein.

## 14. Ihre Rechte

Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung
(Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit
(Art. 20) und **Widerspruch gegen Verarbeitungen auf Grundlage berechtigter
Interessen (Art. 21)**. Viele davon können Sie selbst ausüben: In den
Einstellungen laden Sie Ihre Daten herunter und löschen Ihr Konto. Sonst
schreiben Sie an [[datenschutz@bekvor.com]].

Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77
DSGVO), zum Beispiel bei der für uns zuständigen: [[Landesbeauftragte(r) für
Datenschutz des Bundeslandes, in dem Bekvor sitzt, mit Anschrift]].

## 15. Pflicht zur Bereitstellung

Für ein Konto brauchen wir Ihre E-Mail-Adresse und ein Passwort, für einen
bezahlten Plan die Rechnungsangaben. Ohne diese Angaben können wir den Vertrag
nicht schließen. Alles andere ist freiwillig.

## 16. Änderungen

Wir passen diese Erklärung an, wenn sich der Dienst oder das Recht ändert. Es
gilt die Fassung auf dieser Seite. Stand: [[Datum]].
