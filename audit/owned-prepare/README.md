# Unnötige Kopie bei der Ladevorbereitung vermeiden

Ausgangscommit: `b1ac1e31c33f150cce0218418ab6de0f165eae35`.

## Änderung

Der kurzlebige Datei-Worker erhält per postMessage bereits eine unabhängige Kopie des Spielstands. Die bisherige Vorbereitung kopierte diesen gesamten Zustand nochmals. Der Worker übergibt jetzt explizit den Besitz seines Inputs an die Ladevorbereitung; diese normalisiert die bereits isolierte Kopie. Bei Fehlern wird dieser Worker-Zustand verworfen. Die laufende Partie im Hauptthread wird dadurch nicht verändert.

`prepareLoadedState` bleibt der sichere öffentliche Standard mit unabhängiger Kopie. Nur der interne Worker-Einstieg setzt `ownedInput: true`; dieser Schalter stammt nicht aus dem Spielstand. Direkte Aufrufe von runSaveFileTask behalten standardmäßig die Kopie. Import, Export, Archivprüfung, Kompression und Datenformate bleiben unverändert.

## Nachweise

676 Tests bestanden, ein bestehender Test übersprungen. Vier neue Tests vergleichen öffentliche und besitzübernehmende Normalisierung, identische archivierte Originale, Schutz des Aufrufers bei ungültigen Zuständen und den echten Worker-Einstieg mit Erfolg/Fehlerantworten. Bestehende Tests prüfen weiter die unveränderte laufende Partie bei fehlgeschlagener Aktivierung.

Zusätzlicher lokaler Vergleich mit einer Kopie des vorhandenen privaten Exports: 45,227,555 JSON-Bytes. Keine privaten Inhalte im Bericht und keine Produktionsdaten verändert. Simuliert wird structuredClone zum Worker, Normalisierung und structuredClone der Antwort. Eine Anlaufpaarung, drei gemessene Paarungen mit wechselnder Reihenfolge.

| Schrittfolge | Median |
|---|---:|
| Bisher: drei vollständige Kopien | 868.7 ms |
| Neu: zwei vollständige Kopien | 590.2 ms |

Rund 32.1 % weniger in diesem isolierten Vergleich. Alle normalisierten Ergebnisse strukturell exakt gleich; ursprünglicher Exportzustand unverändert. Eine vollständige Zwischenkopie entfällt; tatsächlicher maximaler RAM-Verbrauch wurde nicht gemessen.

Kein vollständiger Browser-Ladetest: Worker-Scheduling, IndexedDB, Archivwiederherstellung/-kompression und UI fehlen in der Zeitmessung. Keine Aussage über Tagesvorlaufgeschwindigkeit. Reproduktion: `node bench/owned-prepare-replay.cjs --save /private/export.json --output /tmp/neuer-ordner`. Kein Frontend veröffentlicht.
