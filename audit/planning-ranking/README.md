# Gemeinsame Auftragsrangfolge je Standort

## Befund und Änderung

Das CPU-Sampling eines Tagesvorlaufs der Exportkopie (97 aktive LKW, 6 Standorte) zeigte `suggestTours` als größten einzelnen eigenen Rechenblock: ca. 689 ms gesampelte Eigenzeit bei 4,92 s Gesamtlaufzeit. Weitere Zeit entfällt auf Planungsressourcen, Planberechnung und Ereignisverarbeitung. Diese Werte sind Sampling-Schätzungen, keine exakten Funktionslaufzeiten.

Bisher bewertet und sortiert die Tourensuche geeignete Aufträge für jeden LKW erneut. Die neue Hilfsfunktion baut innerhalb EINES schreibfreien Planungsaufrufs je zukünftiger Fahrzeugstadt eine stabile Rangfolge auf. Daraus wird die geeignete Teilmenge für das konkrete Fahrzeug ausgewählt. Reihenfolge, Annahmepriorität, Lieferfristen, Erlös-pro-Kilometer-Bewertung, Kapazitäts-/Aufbautypprüfung, bereits vergebene Aufträge und Kandidatenlimit bleiben erhalten. Unterhalb des Limits bleibt die ursprüngliche unsortierte Reihenfolge bestehen. Nicht endliche Sortierschlüssel nutzen das bisherige Sortieren der Teilmenge; zwischen Planungsaufrufen bleibt kein Cache bestehen.

Frontend-Engine und `base44/shared` sind identisch angepasst. Keine Produktionspartie verändert, keine Archivdaten gelöscht, Frontend nicht veröffentlicht.

## Nachweis

634 Tests bestanden, 1 bestehender Test übersprungen. Build und Lint erfolgreich. Fünf neue Tests vergleichen das bisherige Verfahren mit wechselnden Teilmengen, drei Städten, mehreren Limits, Gleichständen, Objektidentität, ungewöhnlichen Sortierschlüsseln und Änderungen zwischen Planungsaufrufen.

Drei aufeinanderfolgende Tage auf einer Kopie des privaten Exports:

| Folgetag | Vorher | Nachher |
|---|---:|---:|
| 1 | 4.688 ms | 4.581 ms |
| 2 | 3.319 ms | 3.273 ms |
| 3 | 3.136 ms | 3.114 ms |

Alle verglichenen Betriebsfelder, Personal-/Flotten-/Kunden-/Tourendaten und Lieferungen identisch. Finanzberichte werden an mehreren historischen Zeitpunkten verglichen; alle 22.957 ursprünglichen Journalbelege unverändert erhalten. Archivverzeichnis und Journalaufteilung werden getrennt geprüft, nicht als identische Speicherrepräsentation behauptet.

Reproduktion: `node bench/planning-ranking-replay.cjs --save /private/export.json --baseline /path/to/before/src/lib/simulation --output audit/planning-ranking/replay.json`. Profil: `node bench/engine-profile.cjs --save /private/export.json` (für das Vorherprofil den vorherigen Quellstand verwenden).

## Bewertung und Grenzen

Der gemessene Unterschied beträgt hier nur etwa 0,7–2,3 %. Einzelne sequentielle Vergleiche sind kein statistisch belastbarer Beschleunigungsnachweis. Keine Browser-, IndexedDB- oder Cloud-Gesamtdauer; reine Engine-Zeit, Archivkompression separat erfasst. 97 LKW und 6 Standorte sind kein Nachweis für 250+ LKW oder mehrere tausend Tage. Das Ziel durchgehend unter 20 Sekunden bleibt offen.

Der nächste größere Schritt muss auf einem repräsentativen 250-LKW-Skalierungsprofil beruhen. Weitere kleine Transport- oder Sortieroptimierungen allein belegen dieses Ziel nicht. Das bestehende historische Auslagern muss außerdem für sehr lange Spiele weiterentwickelt werden.
