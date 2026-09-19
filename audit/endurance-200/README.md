# Laufender Lasttest: 200 Tage / 250 LKW / 10 Standorte

Status: LAUFEND, noch kein Abschlussbericht. Spielsimulation und Produktionsdaten bleiben unverändert.

## Ablauf und Messgrenzen
`bench/endurance-200.cjs` führt kontinuierlich 200 echte Engine-Tagesvorläufe aus (Tag 1 08:00 bis Tag 201 08:00, also einschließlich Vorlauf an Tag 200). Alle 20 Tage wächst der Test um 25 LKW und einen Standort. Ab Tag 181 sind es 250 LKW und zehn Standorte.

Synthetische Testbedingungen: 35 Fahrer und sechs normale Disponenten je Standort; reichlich Testkapital; täglich zwei Testangebote je LKW zusätzlich zum natürlichen Markt; täglicher Fahrzeugzustandsboden 85 und Zufriedenheitsboden 75. Auslastung wird anhand aktiver LKW und tatsächlich abgeschlossener Lieferungen ausgewiesen. Keine manuelle Historienlöschung, keine Änderungen an der Engine. Wirtschaftliche Erreichbarkeit des Ausbaus wird nicht geprüft.

Täglich gemessen: Engine-Zeit für advanceTime(1440), Kopierzeiten separat, Serialisierung separat, Zustandgröße, Aufträge, Touren, Journal, tatsächlich abgeschlossene Lieferungen und Planungshäufigkeit. KEINE Browser-End-to-End-Zeit. Mediane umfassen unterschiedliche fortlaufende Tage derselben Flottenstufe, keine Wiederholungen identischer Zustände. Der Lauf ist nicht dafür geeignet, Flottengröße, Spielalter und Standortzahl kausal voneinander zu trennen.

## Laufzeit und Sicherung
- Aktiver Prozess: `node bench/endurance-200.cjs 200 /tmp/frachtfieber-endurance`.
- Log: `/tmp/frachtfieber-endurance.log`.
- Rohdaten: `/tmp/frachtfieber-endurance/days.jsonl`.
- Abschluss: `/tmp/frachtfieber-endurance/done.json` NUR nach 200 vollständig ausgeführten Vorläufen.
- Fehler: `/tmp/frachtfieber-endurance/error.json`.
- `bench/endurance-watch.cjs` kopiert Messungen minütlich hierher und komprimiert den jeweils jüngsten 20-Tage-Wiederaufnahmepunkt.
- Zusammenfassung aktualisieren: `node bench/endurance-summary.cjs`, anschließend `/tmp/frachtfieber-endurance/summary.json` hierher kopieren.

## Fortsetzen nach Sandbox-/Prozessverlust
Nicht starten, solange der vorhandene Testprozess noch läuft! Über `/proc/*/cmdline` auf exaktes Argument `bench/endurance-200.cjs` prüfen; `ps` ist in dieser Sandbox nicht verfügbar.

Falls `/tmp/frachtfieber-endurance` verloren ist, Verzeichnis wiederherstellen, `metadata.json` und `days.jsonl` aus diesem Ordner kopieren, jüngste `state-dayN.json.gz` mit Node `zlib.gunzipSync` in `/tmp/frachtfieber-endurance/state-dayN.json` entpacken. Ggf. alte error.json entfernen/archivieren. Dann:

`node bench/endurance-200.cjs 200 /tmp/frachtfieber-endurance --resume > /tmp/frachtfieber-endurance.log 2>&1 &`

`--resume` lädt den jüngsten fertigen Zustandscheckpoint und verwirft nur Messzeilen N+1 und später, die anschließend real erneut gemessen werden. Ein bereits kompletter Lauf wird nicht wiederholt. Watch-Prozess bei Bedarf separat neu starten. Eventuellen Neustart im Bericht kennzeichnen.

Nach Abschluss: exakt 200 Zeilen, fortlaufende Tage, letzte Flotte 250 / zehn Standorte, kein unvollständiger Tagesvorlauf. CSV + JSON + Bericht sichern. Tabelle pro Ausbaustufe mit Median/Maximum, erste Überschreitung 5/10/30/60/120/180/300 s, Verlaufsgrafik und Grenzen. Keine Engine-Optimierung während des Tests, kein Publish nötig.
