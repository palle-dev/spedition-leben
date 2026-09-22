# DACH-2026.1 — Spielbare Erweiterung und Abnahme

Stand: 22.09.2026. Nicht veröffentlicht. Keine Produktionsspielstände bearbeitet.

## Einstieg

Nach Veröffentlichung: Filialen → DACH & Regeln → DACH-Betrieb aktivieren.
Die Aktivierung ist idempotent und kostenlos. Neue Markt-, Gefahrgut- und Vertragsaufträge werden mit der Regelversion gekennzeichnet. Bereits bestehende deutsche Aufträge behalten ihre alte Kosten-/Zeitplanung. Neue Überstellungen sind reguliert. Ausländische Filialen lassen sich erst nach Aktivierung eröffnen.

73 repräsentative Logistikstandorte: 34 DE, 11 AT, 28 CH. Alle 16 deutschen und neun österreichischen Bundesländer sowie 26 Schweizer Kantone sind mit mindestens einem Ort vertreten. Das ist keine vollständige reale Straßen- oder Gemeindedatenbank.

## Integration

- Gemeinsamer Stadt-/Entfernungskatalog für Simulation, UI, Filialkarten und Netzkarte.
- Länderstrecken über modellierte Grenzübergänge; sichtbare Kennzeichnung angenäherter Geometrie.
- Deutsche Maut, österreichische GO-Maut (auch für E-Lkw) und Schweizer LSVA im eingefrorenen Tarifprofil.
- Separate Zollagenturkosten auf Konto 5030, genau einmal beim Transportstart; dieselben Kosten in Tourliquidität und Ergebnisanzeigen.
- Zollphase bei beladenen Schweizer Grenzpassagen; Dokumentliste in Transportvorschau. 65 € und 90 Minuten sind Spielannahmen, keine amtlichen Gebühren oder Abfertigungszusagen.
- Länderabhängige Nacht-/Wochenendverbote und ausgewählte nationale Feiertage werden als Wartephasen eingeplant.
- Bestehende konservative 8h-Arbeits-/12h-Tagesruhelogik ergänzt um 56h/Woche, 90h/Zweiwochen und 45h-Wochenruhe nach spätestens sechs Tagen.
- Kabotagezustand mit höchstens drei Länderrecords pro Lkw. Beladene internationale Einfahrt, maximal drei EU-Binnentransporte im Siebentagefenster und vier Tage Abkühlfrist nach Ausfahrt; Schweizer Binnenverkehr nur für lokalen Betreiber.
- Projektierte Kabotageberechtigung innerhalb einer Tourenkette; echte Zustandsfortschreibung beim Lieferabschluss und bei Leerfahrten.
- Lokale Filial-Lkw werden dem Betreiberland zugeordnet. Reine Überstellung ändert die Registrierung nicht. Lokale Neuzuordnung freier eigener Lkw ist für 800 € Spielpauschale möglich.
- E-Laderouten, Batteriereserven, öffentliche Ladestopps, Fahrerbudgets, Zoll und Ländermaut werden zusammen geplant.
- Neue Angebote erhalten zusätzliche Fristpuffer für die regulatorische Mindestfahrzeit. Die begrenzte Machbarkeitsprüfung verwendet die echte Planung.
- Österreich/Schweiz sind eigene Marktregionen.
- Migration beim Laden und vor/nach Spielbefehlen; zusätzliche Zustandsfelder bleiben in den bestehenden Save-/Worker-/Archivpfaden erhalten.
- Browser- und Base44-Simulationsmodule sind bytegleich. Zwei bereits vorhandene Frontend-Ergänzungen für deleteApproval wurden dabei auch in den zuvor abweichenden Shared-Kopien nachgezogen.

## Modellgrenzen — ausdrücklich keine vollständige Rechtskonformität

Der Wunsch nach allen rechtlichen Aspekten ist mit dieser Version noch nicht vollständig erfüllt. Die bisherigen Aufträge enthalten weder genaue Zolltarifnummern, Warenursprung/-wert und Importeurdaten noch echte Straßen-/Tunnel-/Achslastdaten. Diese Angaben dürfen nicht erfunden werden.

| Bereich | Abdeckung / Grenze |
|---|---|
| Straßen und Maut | Entfernungsschätzung mit Länderanteilen, keine zertifizierte Lkw-Navigation. Keine exakte Autobahn-/Bundesstraßenabgrenzung, Alpen-Sondermaut oder streckenspezifische IG-L-Regeln. |
| Fahrzeugtarife | Typisierte Euro-VI-/CO₂-Klasse-1-Profile bzw. emissionsfreie Fahrzeuge. Standardgewichte 16/26/40 t, Achsen 2/3/5. DE orientiert sich real an tzGm, CH am maßgeblichen registrierten Gewicht; die bestehenden Fahrzeugdaten werden dafür typisiert. |
| Wechselkurs und Gültigkeit | 1 CHF = 1,05 € als fester Spielkurs. Tarif-/Befreiungsregeln auf 2026 eingefroren, keine automatische Behauptung ihrer Gültigkeit in späteren realen Jahren. |
| Kalender | Regelkalender ab Montag 05.01.2026, gregorianisch. Die vorhandene kaufmännische 30-Tage-Periode bleibt unverändert. |
| Fahrverbote | Allgemeine Länderregeln, ausgewählte nationale Feiertage. Keine vollständige regionale Feiertags-, Sommerfahrverbots-, Tirol- oder Umweltzonendatenbank. Keine pauschalen Lebensmittel- oder Lärmausnahmen. |
| Fahrerrecht | Grundgrenzen wie beschrieben. Keine Ausgleichsruhe-, Fähren-/Mehrfahrer-, Heimkehr-, Entsendungs-/Mindestlohn- oder Tachographenverwaltung. |
| Kabotage | Konservatives Standardmodell. Sonderfall einer Leer-Einfahrt, Fristverlängerungen und komplexe Mehrfachladungen sind nicht modelliert. |
| Gefahrgut | Bestehende deutsche ADR-Spielregeln. Internationale Gefahrgutroute wird abgelehnt, bis Strecken-/Tunnelprüfung verfügbar ist. |
| Zoll | Automatische Agentur und Transportdokumenthinweise; kein echter ATLAS-/Passar-/NCTS-Vorgang. Kein pauschaler Warenzoll oder Einfuhrumsatzsteuerbetrag als Frachtführerkosten. |
| Betriebe | Filialen abstrahieren lizenzierte lokale Betreiber. Keine echte Lizenzbeantragung, EORI-/UID-Verifizierung, Gesellschaftsgründung oder fahrzeugbezogene Importabgaben. |
| Steuern/Haftung | Bestehende Netto-Spielbuchhaltung. Umsatzsteuer/Reverse Charge, CMR-Haftung und länderspezifisches Arbeits-/Gesellschaftsrecht sind keine vollständig simulierten Teilsysteme. |
| Andere Spielaufträge | Neue Markt- und Vertragsaufträge sind reguliert; ältere Aufträge und nicht umgestellte deutsche Story-Sonderaufträge behalten bisherige Regeln. |

Die 800-€-Neuzuordnung ist keine Aussage über die realen Gesamtkosten eines Fahrzeugimports.
Die Spieldokumente ersetzen keine Zollanmeldung und keine Transportgenehmigung.

## Amtliche Ausgangsquellen

Am 22.09.2026 geprüft; Links auch in der Oberfläche:

- [Toll Collect – Mauttarife](https://www.toll-collect.de/de/toll_collect/bezahlen/maut_tarife/p1745_mauttarife_07_2024.html)
- [ASFINAG – GO-Maut 2026](https://www.go-maut.at/tarife)
- [BAZG – LSVA-Berechnung](https://www.bazg.admin.ch/de/lsva-berechnung)
- [BAZG – LSVA FAQ, einschließlich E-Lkw](https://www.bazg.admin.ch/de/faq-lsva)
- [BAZG – Fahrzeugimport und Binnenverkehr](https://www.bazg.admin.ch/de/einfuhr-schweiz-strassenfahrzeuge-firmen)
- [BAZG – Passar](https://www.bazg.admin.ch/de/passar-warenverkehrssystem)
- [EU – Lenk- und Ruhezeiten](https://transport.ec.europa.eu/transport-modes/road/social-provisions/driving-time-and-rest-periods_en)
- [EU – Kabotage](https://transport.ec.europa.eu/transport-modes/road/mobility-package-i/market-rules/rules-cabotage-applicable-21-february-2022_en)
- [DE – §30 StVO](https://www.gesetze-im-internet.de/stvo_2013/__30.html)
- [AT – Fahrverbote](https://www.usp.gv.at/themen/betrieb-und-umwelt/transport-und-verkehr/lkw-fahrverbote.html)
- [CH – Fahrverbote](https://www.astra.admin.ch/de/sonntags-und-nachtfahrten)
- [CH – Sonderbewilligungen/Gefahrgut](https://www.astra.admin.ch/de/sonderbewilligungen)

## Nachweise

121 Tests in 12 relevanten Suites bestanden; maschinenlesbar in validation.json.
16 neue DACH-Tests enthalten echte Lieferung, Buchung Konto 5030, grenzüberschreitende Überstellung und lokale Registrierung, Kabotage, Save/Load, unveränderliche UI-Vorschau, Geometrie sowie Gleichheit von 1 Tag / 1 Stunde / 15 Minuten und Remote-Engine.

Der Verkehrskartentest wurde von 90 Kanten für 30 Orte auf maximal drei Nachbarschaftskanten je Ort umgestellt. Diese lineare Obergrenze bleibt bestehen; der tatsächliche DACH-Fallback enthält 139 Kanten.

Zusätzlicher synthetischer Mikrobenchmark: 250 unabhängige Diesel-Tourenplanungen, fünf Durchläufe, zuletzt Median 21,21 ms, Maximum 25,22 ms. Das misst nur diese Planungen, weder einen vollständigen Simulationstag noch den Browser oder die autonome Disposition.

Build und ESLint der berührten UI-Dateien erfolgreich. Statisches React-Rendering geprüft; keine authentifizierte visuelle Browserabnahme. Globaler Typecheck enthält weiterhin bestehende Fehler außerhalb dieser Erweiterung (u.a. EnergyPanel/SiteExpansionCard); er ist kein grünes Gesamtprojekt-Gate.

## Nächste fachliche Ausbaustufe

Für eine weitergehende rechtliche Simulation zuerst ein versioniertes Straßenkorridor- und Frachtstammdatenmodell einführen, dann regionale Streckenregeln/Sondermaut, Zollverfahren/Warenattribute, Genehmigungen und länderspezifische Steuer-/Personalprozesse darauf aufbauen. Keine pauschalen vermeintlich rechtsgültigen Kosten ergänzen.
