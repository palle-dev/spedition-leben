# Wiederverwendbarer Historien-Lese-Worker — 2026-09-20

Baseline: 1a2e96e4382fb996356eed2902f9ff992682a6a5.

Bisher erzeugte jede Journal-/Historienseite einen neuen kurzlebigen Worker.
50-Zeilen-Seiten konnten denselben 1.000-Zeilen-Archivblock wiederholt laden,
SHA-256-prüfen, entpacken und parsen.

historyPage und journalPage verwenden jetzt einen gemeinsamen, rein lesenden
Worker. Import, Export, Vorbereitung und Simulation bleiben getrennt. Abfragen
werden im Worker sequenziell abgearbeitet; IDs ordnen Antworten korrekt zu.
Benutzer/Sessiongeneration bilden die Grenze. Explizites Reset beim Benutzer-
und Spielstandwechsel verwirft den Worker und lehnt offene Abfragen ab; späte
Antworten eines früheren Workers werden ignoriert. Fehler führen nicht zu einer
Wiederholung von Spielbefehlen. Nach 60 Sekunden Leerlauf wird der Worker beendet.

Cache nur für geprüfte, unveränderliche IndexedDB-Referenzen:
- Schlüssel Benutzer + kompletter Deskriptor; Inline-Blobs immer erneut prüfen.
- LRU-Grenzen 8 MiB entpacktes JSON, 4.000 Datensätze, acht Blöcke.
- Das sind logische Grenzen, keine exakte Heap-Obergrenze; JS-Objektoverhead kommt hinzu.
- Cacheobjekte rekursiv schreibgeschützt. Größere Blöcke ohne Cache verarbeiten.
- Keine Speicherung von Suchergebnissen und keine Änderung des Archivformats.

## Nachweise
596 Tests bestanden, ein vorhandener Test übersprungen. Build und ESLint erfolgreich.
Gezielte Tests: Wiederverwendung, Eigentümer-/Deskriptortrennung, Inline-Prüfung,
Prüfsummenfehler, alle drei LRU-Grenzen, readonly-Daten, Request-ID-Zuordnung,
Reset, veraltete Antworten, Idle-Timeout, Workerfehler, Nur-Lese-Befehle,
serielle Worker-Ausführung und Fortsetzung nach Abfragefehlern.

bench/history-reader-replay.cjs --save /private/export.json --output /tmp/metrics.json

Auf privater Exportkopie, 20 Historienseiten/1.000 Journalbelege:
vorher 21 Block-Lese-/Entpackvorgänge, danach zwei. Alle Seiteninhalte UND Cursor
tiefengleich. Einmalige lokale Messung 283,8 → 26,6 ms.

## Grenzen
In-Memory-Blockablage im Vergleich; keine echte IndexedDB-/Browser-/Netzwerkzeit,
kein echter Worker-Startzeitvergleich, kein Tagesvorlauf-Speedup.
Volltextsuche über bislang unbekannte Blöcke benötigt weiter einen Archivscan.
Manifest und aktive Journalzeilen werden pro Abfrage weiterhin übertragen.
Cloud-Laden stellt weiterhin eine vollständige Sicherung zusammen.
Langfristig begrenzte aktive Daten/Projektionen/Manifeste bleiben offen.

Produktionsdaten unverändert. Keine Veröffentlichung vorgenommen.
Frontend manuell veröffentlichen.
