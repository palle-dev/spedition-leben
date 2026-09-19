# Leistungsprüfung des Exports „palle“

## Ergebnis

Unveränderter Originalexport: Spielminute 176436, 97 aktive LKW (zusätzlich 19 archiviert), sechs Standorte, 97 Fahrer, 30,143 Aufträge. Alle Wiederholungen starten von einer frischen Kopie desselben Exports. Keine Produktionsdaten oder Exporte wurden verändert.

| Messung | Vorher | Nachher |
|---|---:|---:|
| +1 Tag, reine Engine | 129.572 s (ein Lauf) | 18.414 s Median (drei Läufe) |
| +1 Tag, Maximum nachher | — | 19.267 s |
| +1 Std, reine Engine | 5.191 s | 1.165 s |

Optimierte Tagesläufe: 18.092 s, 19.267 s, 18.414 s. Verhältnis Ausgangslauf zu optimiertem Median: 7.04×. Der erste optimierte Lauf ist bereits enthalten; keine Ausreißer entfernt.

85 zusätzliche Lieferungen im Tagesvorlauf. Alle Tagesläufe enden bei Spielminute 177876. Die SHA-256-Prüfsumme des **vollständigen serialisierten Ergebniszustands** ist vorher/nachher identisch, ebenso beim Stundenlauf. Zahlen siehe `measurements.json`. Keine künstliche Unterstützung von Flotte, Kapital oder Zufriedenheit.

## Änderungen

- Kurzlebiger Arbeitsbestand der offenen/laufenden Aufträge während eines Vorlaufs. Historische Aufträge bleiben gespeichert und per ID erreichbar. Neue Aufträge und Array-Austausch bei Bereinigung werden berücksichtigt.
- Gemeinsamer Index innerhalb einer Dispositionsrunde; alle Mitarbeiter sehen Feldänderungen und bereits bestätigte Touren.
- Telefonvorschläge teilen nur innerhalb einer unveränderlichen Planungsphase Fahrzeug-, Fahrer-, Trip- und Tourdaten. Zwischen Ereignissen wird der Kontext verworfen; echte Bestätigungen prüfen frisch.
- Erwartbar unmögliche Vorschläge benötigen keine Millionen Exception-Objekte mehr. Abgelaufene harte Ladefenster, Überladung und unpassender Aufbau werden vor dem Durchprobieren sämtlicher Fahrer ausgeschlossen.
- Fahrer am falschen zukünftigen Standort werden vor der Einzel-/Doppeltourensuche ausgeschlossen. Die Engine lehnte diese Kombinationen bereits vorher immer ab.
- Keine Änderung von Lieferfristen, Auswahlregeln, Wirtschaft oder Zufallsfolge. Keine Historienlöschung durch diese Optimierung.

## Abnahme und Messgrenzen

481 Tests bestanden, ein Test übersprungen; Produktionsbuild und vorhandener Lint-Lauf erfolgreich. Neue Tests sichern Cache-Bereinigung bei Fehlern, verschachtelte Suchen, frische Bestätigung, Auftragszugänge, Mitternachtsbereinigung, Mitarbeiterzuordnung und die exakte Grenze des Ladefensters ab. Browser- und Servermodule sind identisch.

Gemessen mit Node v24.19.0 ohne CPU-Profiler. Nicht enthalten: Start/Transpilierung, Eingangskopie, JSON-Serialisierung, Worker-Übertragung, Rendering oder Speicherung. Ergebniszustand: 46,181,861 Bytes JSON. Die drei Engine-Läufe liegen unter 20 Sekunden; **unter 20 Sekunden vom Klick bis zur bedienbaren Browseroberfläche ist damit noch nicht belegt**. Ebenso keine Garantie für andere Geräte oder beliebig große Spielstände.

Der separate Langzeittest bis Tag 200 bleibt ein eigenständiger Test mit eingefrorenem Ausgangscode. Seine Ergebnisse dürfen nicht als Messung dieser Optimierung ausgegeben werden.

## Wiederholung

`node bench/replay-export.cjs --save /privater/pfad/export.json --runs 3 --output /tmp/replay.json`

Für Stundenlauf zusätzlich `--minutes 60`; für eine archivierte Engine `--engine /pfad/zu/simulation`. Originalexport und vollständige Ergebniszustände sind absichtlich **nicht** Teil dieses Repositories. Uhrzeit innerhalb der Simulation ist für reproduzierbare Zustandsvergleiche fixiert; die Laufzeitmessung verwendet `performance.now()`.

## Wartungshinweis

Der Vorlaufindex gilt ausschließlich innerhalb eines synchronen Zeitvorlaufs. Bestehende Mutationen hängen Aufträge an oder ersetzen das Array beim Bereinigen; Statusfelder werden an denselben Objekten geändert. Falls zukünftige Funktionen einzelne Arrayeinträge ersetzen oder terminale Aufträge während des Vorlaufs wieder öffnen, muss der Index dafür erweitert bzw. explizit invalidiert werden. Alle Kontexte werden in `finally` entfernt/restauriert und niemals gespeichert.

Änderungen sind zur Veröffentlichung über das Base44-Dashboard vorgesehen; kein automatisches Publish.
