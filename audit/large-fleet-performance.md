# Großflotten-Optimierung – 19.09.2026

Baseline: `767bacd8300c59b6677953b07400499b49930a5a`.

Die gemeldeten 3–5 Minuten im echten Browser wurden nicht reproduziert. Die folgenden Werte messen die Engine unter Node.js 20, nicht React, Speicherung oder Browser-Gesamtdauer.

## Kontrollierter Lasttest

100 tatsächlich gestartete LKW, 100 Fahrer, 10 autonome Disponenten, 500 Aufträge, zwei Routen. Künstlich vervielfachte Testdaten; Einsätze werden über `confirmTour` gestartet. Identisches Ausgangs-JSON, feste Uhr; Laufzeitmessung mit `performance.now`. Keine gleichzeitig laufenden Tests während der Vergleichsmessungen.

| Vorlauf | Vorher, Median 3 Läufe | Nachher, Median 3 Läufe | Beschleunigung |
|---|---:|---:|---:|
| 1 Stunde | 1.112 ms | 533 ms | 2,1× |
| 1 Tag | 15.102 ms | 5.157 ms | 2,9× |

Zusätzlich 10.000 historische Nachrichten (je ein Kontrolllauf): Stunde 1.256 → 597 ms; Tag 15.994 → 5.568 ms. Structured-Clone für Ein-/Ausgabe: 15–57 ms im Node-Test. Vollständiges Endzustands-JSON vorher/nachher identisch für beide Zeitschritte und beide Historienvarianten; SHA-256-Werte in der begleitenden JSON-Datei.

## Änderungen

- Statische Stadt-Distanzen einmal berechnen, unveränderte Formel und Rundung.
- Lokales Planungsergebnis direkt ergänzen statt ein großes Objekt kopieren.
- Fahrerzähler nur innerhalb einer unveränderlichen Tourensuche zwischenspeichern.
- Gleichwertige Fahrer innerhalb derselben Fahrzeugsuche auslassen: Stadt, Verfügbarkeit, Reservierung, Arbeits-/Lenkzeit und Befristungsende bilden den Schlüssel. Der erste Fahrer gewinnt weiterhin bei Gleichstand.
- Tourenberechnungen pro Testtag: 852.077 → 351.605.
- Keine ausgelassenen Simulationsereignisse, reduzierten Suchlimits oder zusätzlichen Historienlöschungen. Browser-/Server-Engine synchron.
- Diagnose unterstützt 60/1440 Minuten und trennt Worker-Rechenzeit vom Rundlauf. Restzeit umfasst Übertragung, Warteschlange und Zustellung; sie ist kein isolierter Serialisierungswert. Darstellung/Speicherung nach Ergebnisübernahme sind nicht enthalten.

## Wiederholen

```
node bench/large-fleet.cjs 100 0 3
node bench/large-fleet.cjs 100 10000 1
npm test
npm run build
npm run lint
```

449 Tests der Gesamtsuite und 2 zusätzliche Worker-Tests bestanden; 1 vorhandenes Real-Save-Replay mangels externer Fixture übersprungen. Build und Lint erfolgreich. Der projektweite Typecheck meldet bestehende Fehler; Vergleich mit der Baseline separat dokumentiert.

Nach Veröffentlichung auf dem betroffenen Gerät prüfen. Bei weiterhin hoher Laufzeit: Strg+Umschalt+D, Zeitspanne wählen, Bericht kopieren. Für exakte Reproduktion den betroffenen Spielstand exportieren. Die Diagnose setzt das Spiel fort; bei Bedarf vorher einen Slot sichern.
