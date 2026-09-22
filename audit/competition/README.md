# Wettbewerb, Übernahmen und Personalwechsel

Umgesetzt am 22.09.2026. Einstieg: **Spielwelt → Wettbewerb**. Bei inaktiver Spielwelt zuerst kostenlos „Spielwelt betreten“. Bestehende Spielstände werden beim Laden ohne Kosten oder Zeitnachholung ergänzt.

## Spielumfang

- Die drei bestehenden Konkurrenten besitzen persistente Fahrzeugbestände und Mitarbeiter. Transportkapazität hängt von Lkw, Fahrern und Disponenten ab. Die Profile zeigen Reserve, Zuverlässigkeit, Beziehungen, regelmäßige Lieferungen, Preiseinfluss, Fahrzeugbestand und sieben Tagesmesspunkte.
- Die Konkurrenz bezahlt regionales Tagesgeschäft, Löhne und Standortkosten aus eigenen Reserven. Bei ausreichenden Reserven sind wöchentlich Nachbesetzungen und Flottenwachstum möglich (höchstens 40 Lkw pro Konkurrent).
- Ausschreibungen berücksichtigen tatsächliche Kapazitäten. In Übernahme befindliche oder bereits übernommene Firmen geben keine neuen Gebote ab und starten keine neuen Abwerbungen/Kooperationen.
- Neue normale Marktangebote erhalten einen begrenzten lokalen Konkurrenzpreisfaktor. Vorhandene Auftragsvergütungen werden nicht verändert. Der angezeigte Kapazitätsanteil ist ausdrücklich kein gesamter Marktanteil.
- Mitarbeiterangebote: Fahrer, erfahrene Disponenten, beim größeren Betrieb zusätzlich Buchhaltung und Werkstatt. Disponenten besitzen nutzbare Weiterbildungen (effiziente Disposition bzw. Dispositionsleitung).

## Unternehmensübernahme

1. Unternehmensprüfung für 750 €, Dauer ein Spieltag.
2. Bewertung sieben Tage gültig; Preis, Fahrzeugwert und laufende Kosten werden angezeigt.
3. Angebote zu 95/100/110 % des ermittelten Wertes. Beziehung und finanzielle Lage bestimmen die Annahmeschwelle. Ein zu niedriges Angebot erzeugt ein sichtbares Gegenangebot ohne Kaufpreisabbuchung.
4. Bestätigung eines akzeptablen Angebots bucht den Kaufpreis verbindlich auf ein eigenes Anzahlungs-Konto 1320.
5. Übergabe frühestens zwei Tage später, nach laufenden Ausschreibungen und Fahrzeugvermietungen. Keine zusätzliche freie Flotte wird erzeugt: vorhandene Konkurrenzfahrzeuge und verbliebene Mitarbeiter werden übertragen.
6. Existiert in derselben Stadt eine aktive Filiale, werden Standortkosten und Stellplätze hinzugefügt; andernfalls entsteht eine neue Filiale. Dispositionsschichten/Zuweisungen bleiben für den Spieler überprüfbar.
7. Der Preis wird auf Fahrzeuge und übrigen Betriebswert verteilt, Anzahlungen ausgeglichen, Anlagen zur normalen Abschreibung registriert.

Es handelt sich um den Kauf des operativen Betriebs: Verkäufer-Bargeld und Altverbindlichkeiten werden NICHT übertragen. Die ehemaligen Inhaber bleiben als Personen in den Geschichten erhalten. Die Prüfgebühr wird bei Abbruch oder Ablauf nicht erstattet; nach verbindlichem Kauf gibt es keinen Rücktritt.

## Abwerbung

- Angebot 110/125/150 % des bisherigen Tagesgehalts; Zielfiliale wählbar.
- Antwort nach einem Spieltag, einmalig gespeicherte Zufallsentscheidung. Wechselbereitschaft hängt von Aufschlag und Zufriedenheit ab.
- Zusage drei Tage gültig, danach explizite Einstellungsbestätigung erforderlich.
- Fünf Tagesgehälter Wechselprämie werden einmalig gebucht. Arbeitsbeginn frühestens zwei Tage später, nach laufenden Konkurrenztransporten; danach normaler Lohn und nutzbare Qualifikationen.
- Erfolgreiche Abwerbung verschlechtert das Verhältnis. Zwischen erneuten Angeboten gilt eine Wartefrist. Kaufprüfung und offene Personalwechsel derselben Firma werden gegen widersprüchliche Übergaben gesperrt.
- Bestehende Abwerbeversuche gegen eigene Fahrer sind direkt im Wettbewerbsbereich beantwortbar. Kein Gratis-Lkw mehr beim Fahrerwechsel; laufende/geplante Touren verhindern sofortige Entlassung.

## Kooperationen

- Offene Angebote und defensive Personalentscheidungen sind unter „Vorgänge & Antworten“ bedienbar.
- Gemeinsame Relationen erzeugen tatsächliche freiwillige Auftragsangebote ab der eigenen Filiale.
- Fahrzeugvermietung bindet einen freien eigenen Diesel-Lkw für einen Tag. Keine aktive/geplante Tour und keine Disponentenzuweisung. Der Konkurrent finanziert die Vergütung und stellt Fahrer/Betriebskosten; Spieler erhält die vereinbarte Nettovergütung bei Rückgabe.
- Vermietete Fahrzeuge sind nicht disponierbar oder verkaufbar und erscheinen mit Status „Vermietet“. Rückgabe und Vergütung erfolgen einmalig. Das frühere reine Informationsmail ohne Geldfluss wurde ersetzt.

## Speicherung und Laufzeit

- Unternehmens-, Personal- und Mietfristen sind im Ereignisplaner registriert; identische Befehle können Zahlungen oder Übertragungen nicht doppelt auslösen.
- Bestehende Save-/Cloud-/Export-Infrastruktur speichert den neuen Zustand vollständig. Keine neue Base44-Entity erforderlich.
- Aktiver Verlauf: 270 tägliche Konkurrenzzeilen, 30 abgeschlossene Vorgänge pro Bereich, 20 frühere abgeworbene Personen pro Firma. Ältere Datensätze gehen verlustfrei in das vorhandene Archiv; offene Vorgänge und Sperrfristen bleiben aktiv.
- Das normale Konkurrenzgeschäft wird täglich aggregiert berechnet. Es simuliert keine zweite vollständige Tourenplanung je Konkurrenz-Lkw. Die etablierten drei Konkurrenten werden nach Übernahme nicht automatisch durch neue Firmen ersetzt.

## Nachweise und Grenzen

- `validation.json`: **122 Tests erfolgreich**, 11 Testdateien.
- Einschließlich neuer Wettbewerbssuite: Migration ohne Geld-/Ressourcenduplikate, Gebühren, ungültige und nicht finanzierbare Angebote, Gegenangebote, Anzahlungen und Anlagen, Übergabe bei laufenden Transporten, Personalwechsel, Fristen, Qualifikationen, Archivierung, bestehende Filialen, Mietrückgabe/Verkaufssperre sowie identische Tages-/Stunden-/Viertelstundenschritte und Serverausführung.
- Bestehende Spielweltgeschichten, UI-Rendering, Dispositionszuverlässigkeit, E-Mobilität und große Save-Exporte weiter erfolgreich.
- Vite-Produktionsbuild erfolgreich; gezieltes ESLint der bearbeiteten Anwendungsoberflächen und Save-Migration ohne Fehler.
- Die zehn veränderten Simulationsmodule sind zwischen `src/lib/simulation` und `base44/shared` identisch.
- Kein interaktiver Browser-Durchlauf mit einem echten Benutzer-Spielstand und keine Produktionsveröffentlichung durchgeführt. Testzustände sind separat und synthetisch.
- Die Tests belegen keine pauschale Tagesvorlaufdauer bei beliebig großen Flotten.

## Reproduktion

```sh
npx vitest run tests/competition.test.ts tests/world*.test.ts tests/dispatcher-reliability.test.ts tests/energy-integration.test.ts tests/save-archive.test.ts
npx eslint src/components/world/CompetitionPanel.jsx src/pages/GameWorld.jsx src/components/game/HistoryBrowser.jsx src/components/journal/RivalActivityFeed.jsx src/lib/saveSafety.js
npm run build
```

Nach Veröffentlichung im Wettbewerbsbereich: Firmenprüfung starten, einen Tag vorlaufen lassen, Bewertung ansehen; unabhängig davon ein Mitarbeiterangebot stellen und nach Antwort die Einstellung bestätigen. Prüfungen und Personalangebote derselben Firma zuerst abschließen oder zurückziehen.
