# FRACHTFIEBER – Codeprüfung und Korrekturpaket

Stand: 17. September 2026 · Grundlage: hochgeladenes `logistic-game.zip`

## Ergebnis

Die bereitgestellte Fassung enthält reproduzierbare Fehler in Transport, Buchhaltung und Szenarien. Die korrigierte Fassung besteht **75 von 75 lokal ausgeführten Tests**. Darunter sind ein Replay des tatsächlichen Spielstands von Tag 28 nach Tag 29 und ein synthetischer Betrieb über 35 Tage einschließlich Monatswechsel. Der Produktionsbuild wird erfolgreich erzeugt.

Dies ist ein **getestetes Korrekturpaket**, keine uneingeschränkte Freigabe der laufenden Website. Die Änderungen wurden nicht veröffentlicht. Browserinteraktionen, tatsächliche Base44-Zugriffsregeln und produktive Scheduler-Aufrufe konnten in diesem Durchgang nicht abschließend geprüft werden. Die lokalen Typ- und Lint-Prüfungen bleiben mit dokumentierten Altfehlern offen.

## 1. Prüfgrundlage und Aussagekraft

- Vollständiger ZIP-Inhalt: 482 Dateien. Quellcode, vorhandene Tests, Worker-/Adapterpfad, Finanzberichte, Cloud-Handler und doppelte Simulationsmodule wurden untersucht.
- Ausgangsstand: 15 vorhandene Tests; 14 bestanden. Eine Testannahme setzte den Spielbeginn fälschlich auf Minute 0 statt 08:00 Uhr. Die Erwartung wurde auf die tatsächlich initialisierte Startzeit bezogen.
- Gegenprobe: Von 21 gezielten neuen Prüfungen scheiterten **19 im unveränderten Original**. Der Nachweis steht in `audit/confirmed-before-summary.json`. Die Zahl bezeichnet fehlgeschlagene Prüfungen, nicht notwendigerweise 19 unabhängige Ursachen.
- Endstand: neun Testsuiten mit insgesamt 75 bestandenen Tests. Ergebnisse und einzelne Testnamen stehen in `audit/final-summary.json`.
- Die Backend-Tests führen die echten Handler mit einem nachgebildeten Datenbank-/SDK-Zugriff aus. Sie belegen deren lokale Entscheidungslogik, nicht die Infrastruktur oder RLS-Konfiguration im produktiven Base44-Projekt.
- Testumgebung: Node.js 24.19.0; Abhängigkeiten sind durch `package-lock.json` festgelegt. Vitest ist nun installiert und über `npm test` ausführbar.

## 2. Wesentliche Befunde und Korrekturen

| Bereich | Befund und Wirkung | Korrektur / Nachweis |
|---|---|---|
| Auftragszahlung | Zwei importierte Fahrten für denselben Auftrag konnten doppelte Erlöse und Statistik erzeugen. | Abschluss prüft den terminalen bzw. bereits bezahlten Auftrag. Ressourcen werden freigegeben, Einnahmen nicht doppelt verbucht. Regressionstest. |
| Tourreservierung | Doppelte Aufträge, veraltete Reservierungen oder ein inzwischen stornierter Auftrag konnten weiterverarbeitet werden. | Eindeutige Aufträge, Reservierungsprüfung und erneute Validierung beim tatsächlichen Start. Stornierung gibt zukünftige Reservierungen auch bei laufender erster Fahrt frei. |
| Fahrer-Verfügbarkeit | Krankheit nach der Planung und manuelle Starts waren nicht durchgängig abgesichert. | Startpfade prüfen Krankheit, Urlaub, Schulung, Freistellung und laufende Einsätze erneut. Krankheitsfälle ausdrücklich getestet. |
| Fahrerstandort | Ein Plan konnte Fahrer und Fahrzeug unterschiedlicher Standorte zusammenführen, ohne eine tatsächlich ausgeführte Anreise. | Standort muss beim Start passen; notwendige Anreise erfolgt über die vorhandene Fahrerreise. Dies kann alte, bisher unzulässig ausführbare Pläne stoppen. |
| Fahrerzeiten | Beim Folgeauftrag konnten bereits geleistete Arbeit und Lenkzeit verloren gehen. | Anfangszähler werden am Einsatz gespeichert; Arbeit wird fortgeschrieben, Pausen und Ruhezeiten setzen die passenden Zähler zurück. Folgefahrt getestet. |
| Ladefenster | Anzeige, Vorschau und Engine verwendeten teilweise unterschiedliche Regeln; neue Angebote konnten widersprüchliche Fristen erhalten. | Kanonische Einsatzplanung für Vorschau und Ausführung. Neue Angebote und Vertragsaufträge erhalten geordnete Zeitfenster. Strikte neue Fenster sind versioniert, um alte mehrdeutige Saves nicht still umzudeuten. |
| Finanzbewegungen | Mehrere Käufe und Sonderkosten änderten das Firmenkonto direkt, ohne entsprechende Journalbuchung. | Werkstatt, Filialpaket, Gebrauchtfahrzeuge, Filialleitung, Reise-/Verlegungskosten und Störungskosten laufen über die Buchhaltung. Enthaltene Anlagen werden erfasst. |
| Zahlungsunfähigkeit | Bei exakt null bezahltem Betrag konnte die Ersatzwertlogik falsche Buchungszeilen bilden. | Null und fehlender Wert werden unterschieden; offener Aufwand wird als Verbindlichkeit gebucht. Test mit leerem Firmenkonto. |
| Berichte | Private Entnahmen, Erlösschmälerungen, Kontenkatalog und Periodengrenzen waren nicht durchgängig korrekt. | Gemeinsame Finanzlogik für Oberfläche und Engine, korrigierte Vorzeichen, ergänzte Konten und korrekte Periodenenden. |
| Journalhistorie | Gelöschte ältere Journalzeilen konnten spätere Periodenberichte verfälschen. | Neue Journalzeilen werden vollständig erhalten. Für bereits unvollständige alte Historien wird eine Einschränkung angezeigt. Verlorene Daten werden nicht erfunden. |
| Monatsabschluss / Anlagen | Monatsabschluss konnte den neuen statt des abgelaufenen Monats erfassen. Späte Anschaffungen und Verkauf konnten falsche bzw. doppelte Abschreibungen auslösen. | Richtige Monatsgrenzen, zeitanteilige Anschaffung und Schutz gegen erneute Abschreibung im selben bereits gebuchten Monat. |
| Überfällige Aufträge | Mehrere Ablaufpfade konnten Buchhaltung, Vertragsstatistik und Strafen unterschiedlich behandeln. | Ein gemeinsamer Ablaufpfad mit einmaliger Strafe und Statistik, unter Berücksichtigung laufender Transporte. |
| Werkstatt | Endzeitprognose war verschoben; Mechanikerzuordnung und Freigaben konnten inkonsistent sein. | Aktuelle Schicht berücksichtigen, Mechaniker speichern und unveränderte Wartungsfreigaben deduplizieren. Fortsetzung mit Ersatzmechaniker ohne zweite Teilekosten getestet. |
| Zeitvorlauf | Aufräumen und Hintergrundfunktionen konnten von der Anzahl der UI-Befehle statt allein von der Spielzeit abhängen. | Verarbeitung an Simulationsereignisse gebunden; Bereinigung zentral zu Mitternacht. Freigabe-Stopp meldet den richtigen Grund. |
| Zufallsereignisse | Einzelne Systeme verwendeten ungespeicherten Zufall. | Gemeinsamer deterministischer Generator aus dem gespeicherten Zufallszustand. Reproduzierbare Geburt und identische Replay-Zustände getestet. |
| Mail und Historie | Gekürzte Nachrichtenlisten konnten ungültige Referenzen in Konversationen hinterlassen. | Zusammenhängende Bereinigung mit Erhalt relevanter Nachrichten und Neuberechnung der Referenzen. Transport-/Auftragshistorie behält Referenzen auf noch benötigte Daten. |
| Wertpapier-/Kryptodepot | Rundung konnte eine fast ausgeführte Order oder Restreserve hinterlassen; ungültige Beträge waren nicht ausreichend abgewehrt. | Mengen auf handelbare Einheiten normalisiert, vollständige Ausführung gibt Reserve frei. NaN, Infinity, negative und gebrochene Centbeträge getestet. |
| Szenariostart | Eine einseitige Kreditbuchung konnte ein Szenario abbrechen; die übrigen Starts hatten unpassende Eröffnungsbilanzen. | Für jede neue Szenariopartie vollständige Eröffnung mit Bank, Fahrzeugen, Kredit und Eigenkapital. Alle drei Starts und jeweils ein Folgetag getestet. Bestehende Saves werden dadurch nicht neu eröffnet. |
| Leasing | Nach der ersten Rate konnte das nächste Fälligkeitsdatum auf dem gerade verarbeiteten Termin verbleiben. | Nächste Rate wird auf den Folgemonat gesetzt. Erste Rate, Wiederholung und zweite Monatsrate getestet. |
| UI-Daten | Filialkosten, Ziel-Einheiten, Fahrzeugdaten und Cloud-Spieltag konnten falsche Werte zeigen. | Werte aus den passenden Datenfeldern; gemeinsame Finanz-/Tourlogik. Filialhistorie bleibt ausdrücklich eine Schätzung mit heutigen Zuordnungen und Kostensätzen. |
| Worker-Befehle | Konkurrierende Befehle konnten überlappen; Diagnosedaten verursachten auch ohne aktive Diagnose Aufwand. | Befehle werden nacheinander abgearbeitet; vollständige Größenmessung nur bei angeforderter Diagnose. Fehlerbereinigung beim Worker-Versand. Code-/Buildprüfung, kein erneuter Live-Browsernachweis. |
| Cloud-Speichern | Revisionen brauchten strengere Eingabeprüfung; Spieltage waren unterschiedlich gezählt. | Positive ganzzahlige Revision, einheitliche Tagesanzeige; Eigentümer-/Revisionsfilter und Konfliktantworten lokal getestet. |
| `newGame` | Dieselbe Aktions-ID mit anderem Inhalt konnte fälschlich als identische Wiederholung gelten. | Inhalt prüfen und Konflikt melden. Sequenzielle Wiederholung getestet; gleichzeitiges erstmaliges Erstellen bleibt separat abzusichern. |
| Globale Serverautomatik | Fehlende Anmeldung wurde als vermeintlicher Scheduler-Nachweis akzeptiert, bevor Zugriff mit Service-Rechten erfolgte. | Fehlende oder nicht administrative Identität wird abgewiesen. Für einen produktiven Scheduler muss ein echter, verifizierter Aufrufweg eingerichtet und getestet werden. |
| Doppelte Engine | Browser- und Backendkopien waren unterschiedlich und teilweise unvollständig. | 71 Simulationsmodule identisch synchronisiert. `src/lib/simulation/` ist die gepflegte Quelle; Skript und Paritätstest verhindern unbemerkte Abweichungen. |

Die zugehörigen Dateien sind im Änderungsmanifest aufgeführt. `FRACHTFIEBER_Aenderungen.patch` zeigt die Änderungen gegenüber dem gelieferten ZIP. Ein erheblicher Teil des Diffs entsteht durch die aktualisierten Backendkopien und nicht durch zusätzliche unabhängige Implementierungen.

## 3. Konkrete Prüfergebnisse

| Prüfung | Ergebnis | Einschränkung |
|---|---|---|
| Bestehende Kunden-/Konsistenztests | 15 bestanden | Eine falsche Startzeitannahme im Test korrigiert. |
| Transport-/Datenregressionen | 22 bestanden | Gezielte Fälle, keine vollständige Kombination aller Zustände. |
| Buchhaltung und Lebenszyklus | 11 bestanden | Einschließlich Monatswechsel, Verkauf, Depot und Werkstatt. |
| Cloud-/Backend-Verträge | 15 bestanden | SDK/Datenbank nachgebildet; kein Nachweis produktiver RLS. |
| Engine-Parität | 2 bestanden | Identische Dateien und ausgewählter Tageslauf. |
| Langzeitbetrieb | 1 bestanden, 35 Tage | Kleine Flotte mit eigens gebuchtem Testkapital. |
| Echter Spielstand | 1 bestanden, drei Schrittweiten | Tag 28 → 29; 19 fachliche Zustandsbereiche verglichen. |
| Szenarien und Finanzierung | 8 bestanden | Drei Starts, Kredit/Leasing, ungültige Depotbeträge. |
| Produktionsbuild | Bestanden | Lokaler Build ohne produktive Base44-Umgebungswerte. |
| Typecheck | **Offen: 510 Fehler** | Ausgangsstand 656; keine neuen Diagnosen im Vergleich ohne Zeilennummern. |
| Lint | **Offen: 218 Fehler** | Ausgangsstand 227; verbleibende Meldungen betreffen ungenutzte Imports. |

### Echter Spielstand: Tag 28 → 29

Der echte Adapterpfad wurde mit **1 × 1.440, 24 × 60 und 96 × 15 Minuten** ausgeführt. Verglichen wurden Spielzeit, Zufallszustand, ID-Zähler, Firma, Privatbereich, Statistiken, Fahrzeuge, Fahrer, Personal, Aufträge, Fahrten, Touren, Verträge, Buchhaltung, Werkstatt, Investments, Partner, Buchungen und Mail. Die Objekt-Schlüsselreihenfolge wurde normalisiert; Arrayreihenfolgen und Werte blieben Teil des Vergleichs.

In allen drei Läufen:

- identische Prüfsummen in allen 19 verglichenen Bereichen;
- 27 neu begonnene Fahrten;
- neue Veränderung des Firmenkontos **+5.946,44 €**, exakt entsprechend den neuen Bankjournalzeilen;
- keine im Test erkannten Starts während einer Krankheitsperiode und keine Beladung vor dem frühesten Abholzeitpunkt;
- der untersuchte Werkstattauftrag wurde abgeschlossen.

Das beweist die Übereinstimmung der **neuen Bewegungen**. Bereits vorhandene Abweichungen des alten Kontos vom historischen Journal wurden nicht ausgeglichen. Auch bedeutet der Vergleich nicht, dass jedes UI-Metadatum des gesamten Zustands identisch sein muss.

Die gemessenen Laufzeiten stehen in `audit/real-replay.json`. Es handelt sich um lokale Adaptermessungen ohne Browserrendering, Worker-Transport, Netz und Cloudspeicherung. Daraus wird keine Verbesserung um einen bestimmten Faktor gegenüber früheren Browserzeiten abgeleitet.

### 35-Tage-Lauf

Der synthetische Betrieb startet mit drei Fahrzeugen/Fahrern, zusätzlichem Personal, Werkstatt und ordnungsgemäß gebuchtem Testkapital. Nach jedem Tag werden Bank-/Journalübereinstimmung, ausgeglichene Buchungen, Bilanzgleichgewicht und endliche Werte geprüft. Der Monatsabschluss und das erhaltene Eröffnungsjournal werden ebenfalls kontrolliert.

Nach Tag 35: 72 Lieferungen, 1.809 Aufträge im Zustand, 772 Journalbelege und etwa 3,5 MB JSON-Zustand. Dies ist ein begrenzter Belastungs- und Konsistenztest, kein Nachweis beliebig langer oder großer Partien und kein Balancing-Nachweis.

## 4. Offene Punkte und Grenzen

| Priorität | Restpunkt | Nächster Schritt |
|---|---|---|
| Hoch | Alte Fehlbuchungen, Doppelzahlungen und bereits gelöschte Historie bleiben im vorhandenen Save. | Separate, nachvollziehbare Spielstandsbereinigung aus Sicherung und belegbaren Einzelereignissen. Keine pauschale Differenzbuchung als vermeintliche Reparatur. |
| Hoch | Produktive Datenzugriffsregeln und Eigentümertrennung wurden nicht erneut live verifiziert. | Mit zwei Testkonten fremde List-/Load-/Save-/Delete-Zugriffe und direkten Entity-Zugriff prüfen. |
| Hoch | Der bislang unauthentifizierte Scheduler ist durch die Korrektur gesperrt. | Vor Aktivierung serverseitiger Automatik einen verifizierten Scheduler-Aufruf integrieren. Fehlende Identität darf nicht als Berechtigung gelten. |
| Mittel | Gleichzeitige erste `newGame`-Aufrufe sind durch Lesen-vor-Erstellen nicht atomar dedupliziert. | Einmaligkeit serverseitig absichern und einen echten Paralleltest ausführen. |
| Mittel | Bereits festhängende alte Leasingtermine und vorhandene doppelte Freigaben werden nicht rückwirkend migriert. | Legacy-Save gesondert prüfen; bei Leasing nur belegbare Zahlungen berücksichtigen, keine unkontrollierten Nachbelastungen. |
| Mittel | Typ- und Lint-Gates bleiben rot. | Typfehler nach Komponenten/Modulen abarbeiten; Importbereinigung separat durchführen. Die Regeln wurden nicht abgeschaltet. |
| Mittel | Sichtbare Zahlungsziele und sofortiger Zahlungseingang sind fachlich noch nicht überall abgestimmt. | Festlegen, ob Zahlungsziele eine echte Forderungs-/Fälligkeitslogik bekommen oder die Anzeige geändert werden soll. |
| Mittel | Filialhistorie verwendet heutige Zuordnungen und Kostensätze. | Für exakte historische Auswertungen Filialbezug und gültige Kostensätze an jedem Ereignis speichern. |
| Mittel | Vollständiges Journal wächst künftig weiter. | Bei sehr langen Partien eine verlustfreie Archiv-/Periodenstrategie mit korrekten Eröffnungsbeständen entwickeln; nicht wieder blind Zeilen löschen. |
| Mittel | UI, Mobile, Karten, Anmeldung, Cloud und Worker-Warteschlange wurden nach diesen Änderungen nicht vollständig im Browser durchgespielt. | Abnahme auf einer Testinstanz mit produktionsnaher Base44-Konfiguration. |

Die Simulationsprüfungen beziehen sich auf die implementierten Spielregeln. Sie bescheinigen weder vollständige wirtschaftliche Realität noch die Umsetzung sämtlicher realer Vorschriften zu Fahrerzeiten, Steuer oder Bilanzierung.

## 5. Übernahme und Nachprüfen

Die beiliegende `PRUEFEN_UND_UEBERNEHMEN.md` beschreibt Installation, Testaufrufe, Umgang mit dem echten Spielstand und die notwendigen Schritte vor einer Veröffentlichung. Das Paket enthält Quellcode, Tests und Prüfnachweise; keine installierten Abhängigkeiten, produktiven Zugangsdaten oder privaten Spielstandexporte.

Empfohlene Reihenfolge: Korrekturen in eine getrennte Testfassung übernehmen, lokale Prüfungen ausführen, bestehenden Save als Kopie laden, Kernabläufe im Browser abnehmen und erst anschließend veröffentlichen. Eine rückwirkende Datenbereinigung ist ein eigener Schritt.
