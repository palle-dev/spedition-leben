# Kleineres aktives Finanzjournal — 2026-09-20

Baseline: 8b5b16f3fe79ae18a121dd49ce04eda250d0b50e.

Originaljournalbelege werden nach sieben statt 60 Tagen in das vorhandene
verlustfreie Archiv überführt. Exakte Finanzprojektionen erhalten alle
Auswertungszeiträume inklusive Minutengrenzen. Journalansicht, Suche, Filter,
Seitennavigation und Dateisicherung verwenden weiterhin die Originalbelege.
Vorauszahlungen für vor Beginn stornierbare Serviceverträge bleiben unabhängig
vom Alter aktiv, bis ihre Stornierbarkeit endet. Kein Beleg wird gelöscht.

Compaction policyVersion 2 erzwingt die Übernahme auch dann, wenn der ältere
Client am selben Spieltag bereits komprimiert hat. Archivformat version 1 bleibt
kompatibel. Erst nach vollständiger erfolgreicher Kompression werden Original-
Arrays ausgetauscht; die vorhandene IndexedDB-Übernahme sichert neue Blöcke vor
Adoption des Zustands. Spielregeln und Simulationsengine bleiben unverändert.

## Prüfung
571 Tests erfolgreich, 1 vorhandener Test übersprungen. Build und ESLint erfolgreich.
Zusätzlich: exakt sieben Tage alte Belege verbleiben aktiv; ältere Belege werden
archiviert; gleichentägige Übernahme eines alten checkedDay-Snapshots, vollständige
Journalabfrage nach Export/Import, unveränderte historische Berichte und
freigegebene Stornoquellen sind geprüft.

bench/active-journal-replay.cjs --save /private/export.json
  --baseline /baseline/src/lib/simulation --output /tmp/metrics.json

Kontrollierter Vergleich auf privater Exportkopie mit 97 aktiven LKW/6 Standorten:
- Aktives JSON initial: 22.875.794 → 15.138.232 Bytes (33,82 % kleiner).
- Aktive Journalbelege: 18.207 → 3.169.
- Archivierte Journalbelege initial: 19.788; Projektion 915.465 Bytes.
- Alle 22.957 Belege des ursprünglichen Exports originalgetreu erhalten.
- Nach drei Tagen: 24.269 Belege, davon 3.275 aktiv und 20.994 archiviert.
- Vergleich sämtlicher Zustandsfelder außer Archiv/Outbox/Journal/Projektion
  nach jedem Tagesvorlauf identisch; übrige Buchhaltungsfelder ebenfalls identisch.
- Finanzberichte für mehrere historische Zeitpunkte und alle Originalbelege geprüft.
- Drei Einzelmessungen reine Engine vorher/nachher:
  4.942/4.647 ms, 3.435/3.348 ms, 3.716/3.557 ms.
- Erstkompression ~925 ms; tägliche Kompression ~126–163 ms zusätzlich.

## Grenzen
Einzelmessungen in Node, keine Browser-/Cloud-/IndexedDB-Gesamtdauer oder
<20-Sekunden-Garantie. Mehr archivierte Daten vergrößern Projektionen und Manifest
weiterhin; langfristig begrenzter Zustand noch nicht erreicht. Erste Übernahme
verursacht einmalig mehr Archivschreibvorgänge und Cloud-Übertragungen.
Keine Produktionsdaten verändert, keine Veröffentlichung vorgenommen.
Frontend manuell veröffentlichen.

Nächster Befund: In der gelieferten Exportkopie existieren vier als aktiv
markierte Touren älter als 30 Tage mit ausschließlich completed/skipped
Deployments (3 completed/4 skipped). Hier keine Tourenstatusänderung vorgenommen:
Lifecycle und Folgewirkungen getrennt prüfen, bevor operative Daten ausgelagert werden.
