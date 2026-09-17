# FRACHTFIEBER – Korrekturpaket prüfen und übernehmen

Dieses Paket ist eine lokale Korrekturfassung des gelieferten `logistic-game.zip`. Es wurde nicht auf frachtfieber.de veröffentlicht. Den ausführlichen Befund enthält `PRUEFBERICHT.md`.

## Installation und Prüfungen

Geprüfte Laufzeit: Node.js 24.19.0. In einem getrennten Projektverzeichnis:

```sh
npm ci
npm test
npm run build
npm run typecheck
npm run lint
```

Ohne den privaten Spielstandexport laufen 74 Tests; ein echter Replay-Test wird ausdrücklich übersprungen. In der hier durchgeführten Prüfung wurde der Export eingebunden: **75 bestanden, keiner übersprungen**.

Typecheck und Lint sind noch nicht erfolgreich: 510 Typfehler und 218 Lint-Fehler sind im Bericht dokumentiert. Ein erfolgreicher Build ersetzt diese Prüfungen nicht.

Der Build benötigt für echte API-Aufrufe die zum eigenen Base44-Projekt gehörenden Umgebungswerte, insbesondere `VITE_BASE44_APP_ID` und die passende Projekt-URL. Zugangsdaten sind nicht im Paket. Der hier geprüfte Build belegt Kompilierbarkeit; die produktive Verbindung wurde nicht damit getestet.

## Echten Spielstand wiederholen

Den früher gesicherten Export `FRACHTFIEBER_Ausgang_Tag28.json` unverändert in ein separates Verzeichnis legen. Erwartet wird der ursprüngliche Exportumschlag mit dem Zustand unter `state`. Beispiel für bash:

```sh
FRACHTFIEBER_FIXTURES=/absoluter/pfad/zu/den/exporten npm test
```

Dieser Test ist für genau diesen vorhandenen Ausgangsstand geschrieben, einschließlich eines konkreten Werkstattauftrags. Eine beliebige andere Partie ist kein gleichwertiger Ersatz. Die Prüfung arbeitet lokal mit Kopien und überschreibt den Export nicht.

Die Tests erzeugen Zusammenfassungen unter `audit/`. Bei einer Zustandsabweichung kann der Replay-Test dort zusätzliche vollständige Zustandsausschnitte zur Diagnose ablegen. Solche Diagnoseausschnitte gehören nicht in ein öffentliches Repository.

## Eine Quelle für die Simulationslogik

Änderungen werden in `src/lib/simulation/` gepflegt. Danach:

```sh
node scripts/sync-simulation.mjs
npm test
```

Das Skript aktualisiert `base44/shared/`. Der Paritätstest prüft die 71 Module und einen ausgewählten Simulationslauf. Die beiden Verzeichnisse dürfen nicht unabhängig weiterentwickelt werden.

## Was vor der Veröffentlichung zu beachten ist

1. Änderungen anhand von Patch und Änderungsmanifest in eine getrennte Testfassung übernehmen. Falls Base44 seit dem ZIP weitergeändert wurde, den Patch abgleichen; nicht ungeprüft den neueren Stand überschreiben.
2. Einen bestehenden Spielstand als Kopie laden. Bei alten Kontodifferenzen oder unvollständiger Historie keine automatische pauschale Korrekturbuchung vornehmen.
3. Neues Spiel, alle drei Szenariostarts, Auftrag → Disposition → Lieferung, Krankheit, Werkstatt, Fahrzeugkauf/Leasing, Monatswechsel, Speichern/Laden und Cloudkonflikt im Browser prüfen. Desktop und kleinen Bildschirm einbeziehen.
4. Eigentümertrennung mit zwei Konten und realer Base44-Konfiguration prüfen. Die mitgelieferten Handler-Tests verwenden eine nachgebildete Datenbank.
5. Serverautomatik gesondert behandeln: `processAutomationTick` akzeptiert jetzt nur eine nachgewiesene administrative Identität. Ein früherer Aufruf ohne Nutzeridentität wird abgewiesen. Einen verifizierten Scheduler-Aufruf implementieren und testen, bevor diese Serverfunktion aktiviert wird. Die Sperre nicht durch Erlauben anonymer Aufrufe entfernen.
6. Die offenen Typ-/Lint-Befunde und die produktive Browserabnahme als eigene Aufgaben verfolgen. Erst nach bewusster Abnahme veröffentlichen.

## Arbeitsauftrag zur Übernahme in Base44

> Übernimm das beigefügte FRACHTFIEBER-Korrekturpaket in eine getrennte Testfassung. Lies zuerst PRUEFBERICHT.md und PRUEFEN_UND_UEBERNEHMEN.md. Gleiche den Patch mit dem aktuellen Projekt ab und erhalte inzwischen hinzugekommene Funktionen. Nutze src/lib/simulation als Quelle und synchronisiere base44/shared mit dem beiliegenden Skript. Führe npm test und den Build tatsächlich aus; dokumentiere übersprungene Tests, Typecheck- und Lint-Fehler offen. Prüfe anschließend die genannten Browserabläufe und reale Zugriffstrennung. Repariere historische Konten nicht durch erfundene Ausgleichsbuchungen. Richte für die Serverautomatik einen verifizierten Aufrufweg ein, bevor Du sie aktivierst. Veröffentliche die Änderungen erst nach der Abnahme. Behaupte keine vollständige Produktfreigabe allein aufgrund der lokalen Tests.
