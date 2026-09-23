# Annas spielbarer Auftakt: Ein Versprechen am Kai

Der optionale Einstieg verbindet das erste Kapitel der Hafengeschichte mit zwei echten Transporten. Er erscheint im Büro vor den Kennzahlen sowie auf der Geschichten-Seite. Der Spieler muss ihn ausdrücklich beginnen; vorhandene Kapitelentscheidungen bleiben erhalten.

## Ablauf

1. Anna zuhören startet die Spielwelt zur aktuellen Spielminute. Das wird vor dem Klick erklärt. Noch entstehen weder Transportverpflichtung noch Kosten.
2. Die Warenannahme ist belegt. Der Spieler wählt eine zusätzliche Rampe (90 € sofort, 650 € Vergütung, Abholung sofort, sechs Stunden Lieferfrist) oder eine abgestimmte spätere Übergabe (keine Vorleistung, 570 € Vergütung, Abholung nach 90 Minuten, zehn Stunden Lieferfrist). Die Fristen beginnen mit dieser Zusage.
3. Der angenommene Auftrag Hamburg–Bremen, 6 t, wird über die normale Disposition gefahren. Lkw, Fahrer, Anfahrt, Fahrerzeiten, Kraftstoff, Maut, Storno und Bezahlung folgen der bestehenden Simulation.
4. Erst das reale Endergebnis erzeugt Annas Rückmeldung. Pünktlichkeit, Verspätung und Nichtlieferung werden unterschieden. Vergütung wird ausdrücklich als Umsatz angezeigt.
5. Nach einer Lieferung kann der Spieler eine Rückladung Bremen–Hamburg (4 t, 720 €, zwölf Stunden ab Zusage) annehmen oder sie anderen überlassen. Nach Nichtlieferung gibt es keine Rückladung.
6. Der Abschluss geht in Kapitel 2 der bestehenden Hafengeschichte über. Eine pünktliche erste Lieferung zählt dort als Hilfe für Anna. Bei Verspätung oder Nichtlieferung wird kein gehaltenes Versprechen behauptet. Die bestehenden späteren Entscheidungen bleiben erhalten.

Die Übergabeentscheidung erfolgt vor der Disposition. Sie ist keine zusätzlich eingebaute Zufallsstörung während der Fahrt. Diese erste Umsetzung ist ein zusammenhängender Einstieg, keine auf exakt 60 Echtzeitminuten festgelegte Kampagne.

## Architektur und Schutzbedingungen

- `src/lib/simulation/harborOpening.ts` enthält Zustandsübergänge, Auftragsanlage, Ergebnisbeobachtung und Rückmeldungen. Die identische Kopie liegt unter `base44/shared/`.
- Der gespeicherte Zustand liegt in `world.harborOpening`. Bestehende Spielstände erhalten keine rückwirkenden Aufträge, Fristen oder Abbuchungen.
- `worldEngine.ts` bindet die Befehle und die Beobachtung tatsächlicher Auftragsergebnisse ein. Das alte erste Kapitel kann während des Auftakts nicht gleichzeitig entschieden werden.
- `simulationEngine.ts` wendet die bestehende Sperre während persönlicher Termine auch auf die neuen Geschäftsbefehle an.
- Jeder Auftrag wird einmal erzeugt, die Rampengebühr einmal gebucht. Wiederholte identische Befehle und wiederholte Ergebnisbeobachtung erzeugen keine weiteren Kosten, Aufträge oder Rufänderungen.
- Ein fehlender Auftragsdatensatz wird niemals als Erfolg interpretiert. Abgeschlossene Ergebnisse werden im Auftakt gespeichert und überstehen die normale Archivierung der ursprünglichen Aufträge.
- Die Einwilligung zur Rückladung ist gesondert. Fristen laufen erst ab Zusage; die nächste Entscheidung wartet.
- Geld für Transporte entsteht ausschließlich durch die bestehende Lieferung und Buchhaltung. Rufänderungen folgen dem bestätigten Ergebnis.
- Die UI verwendet eine lokale Klicksperre, zeigt Fehler an und sperrt Aktionen während laufender Befehle, Hintergrundsimulation und persönlicher Termine.
- Die globale Begleitung verweist während des Auftakts auf den richtigen Auftrag, die laufende Fahrt oder Annas Rückmeldung. Danach steht die bisherige Begleitung wieder zur Verfügung.

## Prüfung

`tests/harbor-opening.test.ts` deckt beide tatsächlichen Transportketten, Kosten und Deduplizierung, optionale Ablehnung, Storno, Verspätung, fehlende Aufträge, Speicher-Migration, Archivierung, bestehende Geschichten und Backend-Gleichheit ab.

`tests/harbor-opening-ui.test.ts` prüft Einstiegs- und Ergebnistexte, Entscheidungen, Doppelklick und Fehler, Sperren, Navigation sowie die Anbindung der Begleitung. Für eine rein lokale Darstellungsprüfung kann `ANNA_PREVIEW_DIR` gesetzt werden; dann werden gerenderte Testzustände ausgegeben. Sie enthalten keine Produktionsspielstände.

Die Veröffentlichung erfolgt wie im Projekt-README über das Base44-Dashboard. Die abschließende Liveabnahme verwendet einen separaten Testspielstand.
