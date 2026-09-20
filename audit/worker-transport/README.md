# Revisionsgebundene Wiederverwendung von Journalbelegen im Worker

Stand: 20. September 2026. Ausgangsversion 878b632. Keine Veröffentlichung, keine Produktionsspielstände geändert.

## Architekturänderung
Die Oberfläche sendet weiterhin alle veränderlichen Spielfelder. Unveränderliche Journaloriginale und die unveränderlich fortgeschriebene Finanzprojektion werden nach der ersten bestätigten Antwort im Worker behalten. Weitere Befehle dürfen diese Daten ausschließlich mit passender Revision und exakt den bestätigten Referenzen wiederverwenden. Ein verlorener Bestand führt vor jeder Ausführung zur expliziten Anforderung eines vollständigen Snapshots.

Antworten enthalten statt bekannter Journaloriginale Positionsverweise sowie neue Belege. Dadurch bleiben Reihenfolge, Kürzungen, ersetzte Einträge und neue Buchungen exakt rekonstruierbar. Unveränderte Finanzprojektionen werden ebenfalls wiederverwendet. Das ist ein begrenzter persistenter Finanzbestand, noch kein vollständig persistenter Simulationsexecutor.

Die Oberfläche bestätigt die Wiederverwendung erst nach erfolgreichem `stageHistory`, erneutem Sitzungstest und Schreibfreigabe. Ohne Übernahme bleibt der nächste Befehl eine vollständige Übertragung. Die normale verzögerte Snapshot-Sicherung bleibt bestehen: Die Bestätigung ist keine neue Garantie über eine bereits auf Datenträger abgeschlossene vollständige Spielstandsicherung.

Journaloriginale werden im Worker und in der Oberfläche vor Änderungen geschützt; die Journal-Arrays dürfen im Worker weiterhin durch neue Arrays ersetzt oder um Einträge erweitert werden. Andere Spielfelder bleiben veränderlich und werden immer neu übertragen. Der Worker verarbeitet Nachrichten seriell, auch während asynchroner Archivkomprimierung.

Befehlsfehler verwerfen den wiederverwendbaren Worker-Bestand. Abstürze und unlesbare Antworten beenden den Worker und lösen wartende Anfragen mit Fehler auf; beim nächsten Aufruf wird ein neuer Worker erzeugt. Ein möglicherweise ausgeführter Befehl wird dabei nicht automatisch wiederholt. Nur eine explizite Ablehnung VOR Ausführung wegen fehlender Revision darf einmal mit vollständigem Snapshot erneut zugestellt werden. Benutzerwechsel setzt Worker und Cache zurück; Antworten alter Worker werden ignoriert. Ein geladener Spielstand besitzt andere Finanzreferenzen und wird vollständig übertragen.

Die Übertragungsreferenzen sind kein Bestandteil von Speichern/Exporten/Cloud-Daten. Das bestehende Spielstandsformat bleibt unverändert. Die Diagnose-JSON enthält jetzt `inputPayloadKb`, `reusedFinancialInput`, `reusedJournalRows` und `transportPreparationMs`.

## Nachweise
- 541 Tests bestanden, ein bestehender Test übersprungen. Build und Lint erfolgreich; vorhandene Bundle-Warnungen bleiben.
- Neue Tests: bestätigte/unbestätigte Ergebnisse, Speicherfehler durch unterlassene Übernahme, fehlende Revision, teilweise fehlgeschlagene Befehle, unveränderliche Originale, veränderliche Kontensalden, Umordnung/Kürzung/Ersetzung, Sitzungsreset, Absturz, verspätete Antworten, ungültige Verweise und ausgetauschte Journale.
- Worker-Nachrichten werden im Test auch bei überlappenden asynchronen Aufrufen seriell ausgeführt.
- `bench/worker-transport-replay.cjs` verwendet echte Node-Worker-Threads und das tatsächliche Browser-Worker-Modul über eine Node-Brücke. Vorher: vollständiger Zustand in beide Richtungen. Nachher: neues Protokoll. Beide Varianten verwenden dieselbe Engine.
- Reale Exportkopie: 97 aktive LKW, sechs Standorte. Nach jedem der vier Befehle vollständiger tiefer Zustandsvergleich erfolgreich. Privatdaten und Originalexport nicht im Repository gespeichert.

| Befehl | Vorher | Nachher | Eingabe vorher / nachher | Antwort vorher / nachher |
|---|---:|---:|---:|---:|
| Gehaltseinstellung, Kaltstart | 1.752 ms | 1.711 ms | 22,88 / 22,88 MB | 22,88 / 12,54 MB |
| +1 Stunde | 714 ms | 582 ms | 22,88 / 12,45 MB | 22,88 / 12,79 MB |
| +1 Tag | 4.885 ms | 4.490 ms | 22,88 / 12,45 MB | 23,20 / 13,21 MB |
| +1 Stunde | 706 ms | 515 ms | 23,19 / 12,60 MB | 23,23 / 12,99 MB |

Warme Eingaben sind hier rund 46 Prozent kleiner, Antworten rund 43–44 Prozent. Die Größen sind logische JSON-Nutzlastschätzungen mit dezimalen MB, keine Messung interner Browserbytes; Blob-Inhalte sind darin nicht enthalten. Zwischen 18.018 und 18.455 Journaloriginale wurden in den warmen Antworten wiederverwendet. Zeitmessungen umfassen Node-Worker-Kommunikation, Engine, Komprimierung und Rekonstruktion; die erste Zeile zusätzlich Initialisierung/Transpilierung. Jeweils ein sequenzieller Vergleich, keine statistische allgemeine Geschwindigkeitszusage.

React, Browser-Rendering, tatsächliche IndexedDB-Schreibvorgänge und Cloud sind nicht gemessen. Kein Browser-End-to-End-Test und kein Nachweis für tausende Tage oder mehr als 250 LKW. Die vereinbarte Zielzeit unter 20 Sekunden für die gesamte Anwendung bleibt deshalb offen.

## Verbleibende Arbeit
Die veränderlichen Felder werden weiterhin vollständig kopiert. Als weitere Schritte bleiben deren Aufteilung und bedarfsabhängige UI-Abfragen, begrenzte Simulationsabschnitte mit klaren Bestätigungsgrenzen, partitionierte Finanzprojektionen/Archivverzeichnisse, inkrementelle Cloud-Sicherung und Streaming-Backups. Der neue Finanzbestand benötigt zusätzlichen dauerhaften Worker-Speicher; bei Reset wird dieser freigegeben. Auch die Positionsliste der aktiven Journalbelege wächst mit deren Anzahl. Die Architektur ist damit noch nicht für beliebig große Spielstände vollständig begrenzt.
