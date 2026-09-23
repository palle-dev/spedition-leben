# Der Preis deines Versprechens

Ein freiwilliger spielbarer Weg durch Kapitel 2 „Der Preis der Nacht“. Verfügbar im Büro und unter Spielwelt → Geschichten, solange das Kapitel noch nicht entschieden und NordSprint unabhängig ist. Alte Kapitelentscheidungen und aktive Szenarien erhalten keine neuen Verpflichtungen.

## Spielablauf

- NordSprints erzählerisches Vergleichsangebot: 520 € für Hamburg–Bremen, 6 t, zwölf Stunden ab Abholung. Es wird kein fiktiver rivalisierender Transport als tatsächlich ausgeführt verbucht. Der Kunde bietet dem Spieler einen verbindlichen Probelauf, keine offene Auktion.
- Preisweg: 490 € Vergütung, zwölf Stunden Lieferfenster, bei pünktlicher Lieferung optionale Rückladung Bremen–Hamburg für 620 €.
- Qualitätsweg: 760 € Vergütung, sechs Stunden Lieferfenster, bei pünktlicher Lieferung optionale Rückladung für 850 €.
- Bei Zusage entsteht ein normaler angenommener Auftrag. Abholung am nächsten Spieltag um 08:00; alle angezeigten Lieferfristen werden ab diesem festen Ladebeginn berechnet. Keine zusätzliche Teilnahmegebühr.
- Spieler wählt Lkw und Fahrer selbst. Kraftstoff, Maut, Arbeits-/Lenkzeiten, Storno und Verspätung gelten unverändert. Ausgeruhte Fahrer verwenden; bloßes Warten auf ein Ladefenster ersetzt im vorhandenen Modell keine Ruhephase.
- Kontor-Vertrauen beginnt in dieser Folge bei 40/100. Pünktlicher Probelauf: +20 Preis / +35 Qualität; verspätet −15, nicht geliefert −30. Nur pünktlicher Probelauf eröffnet eine Rückladung, die ausdrücklich zugesagt oder ausgelassen wird.
- Rückladung: sechs Tonnen, Abholung sofort, zwölf Stunden ab Zusage. Pünktlich +15 Kontor-Vertrauen; verspätet −15, nicht geliefert −30.
- Spielwelt-Verlässlichkeit: pünktlicher Qualitätsprobelauf +5, andere pünktliche Lieferungen +3; verspätet −3, nicht geliefert −5. Pünktlicher Probelauf zusätzlich Qualität +3 oder Verhandlungsvorsprung +2. Diese existierenden Rufwerte beeinflussen weitere Ausschreibungen.
- Kontor-Vertrauen und Kundenstatus bleiben als Ergebnis dieser Folge erhalten. Es entsteht kein automatischer Rahmenvertrag oder genereller Stammkundenstatus im separaten Kundenmodul.
- Abschluss führt zu Kapitel 3 „Die Nacht am Kai“. Er ersetzt die abstrakte Kapitelentscheidung ohne deren zusätzliche Kosten oder zeitversetzte Belohnungen nochmals auszulösen. Vor Beginn bleiben die ursprünglichen Kapitelentscheidungen verfügbar.

## Architektur und Schutz vor Doppelausführung

Eigener Simulationsbaustein `nordSprintChallenge.ts`, identisch unter `src/lib/simulation/` und `base44/shared/`. `worldEngine` verarbeitet echte terminale Auftragsergebnisse; `simulationEngine` sperrt die drei Befehle während persönlicher Termine.

Persistenter Zustand: `world.nordSprintChallenge`. Status: trial → debrief → followup → finale → done; eine ausgelassene Rückladung führt von debrief zu done. Keine impliziten Timer für Annahme oder Kapitelabschluss. Ein fehlender Auftrag zählt nie als geliefert. Ergebnis-Snapshots bleiben auch nach normaler Auftragsarchivierung erhalten.

Feste Auftragskennungen und Statusprüfungen verhindern doppelte Annahmen, Vergütungen und Rufänderungen. Wiederholung derselben Wahl ist idempotent; Wechsel nach Zusage wird abgelehnt. Die ursprüngliche Kapitelentscheidung ist während des Probelaufs gesperrt. UI besitzt einen synchronen Klickschutz, zeigt Fehler und verlinkt den konkreten Auftrag bzw. die laufende Fahrt.

## Prüfungen

21 neue Tests: 14 Simulation, 7 Oberfläche. Beide vollständigen Wege nach Annas realem Auftakt; echte Verspätung durch nötige Fahrer-Ruhe; Storno, fehlender Auftrag, wiederholte Befehle, ausgelassene Rückladung, verlorenes Vertrauen, persönliche Termine, Altdaten, Übernahme von NordSprint, Speichermigration und Archivierung. Browser-/Backend-Ergebnisse und Buchungsjournal stimmen überein.

Gesamtsuite: 918 bestanden, 1 übersprungen. Typprüfung, Lint und Produktionsbuild erfolgreich. Echte React-Komponenten mit Produktions-CSS auf Desktop und 390 Pixel Breite geprüft; kein seitlicher Überlauf. Dies ist eine Darstellungsprüfung mit Testdaten. Liveabnahme folgt nach Veröffentlichung.
