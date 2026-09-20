# Verlustfreie Historienablage – erster Architekturbaustein

Stand: 20. September 2026. Nicht veröffentlicht; keine Produktionsspielstände geändert.

## Umsetzung
Historische Originaldatensätze werden vor den eingebundenen automatischen Bereinigungen in eine Warteschlange übernommen. Der Worker komprimiert diese in prüfsummengesicherte Blöcke. IndexedDB speichert die unveränderlichen Blöcke benutzerbezogen getrennt vom aktiven Zustand. Dieser enthält nur das Archivverzeichnis. Die Oberfläche übernimmt einen bereinigten Zustand erst nach erfolgreicher Archivablage. Snapshot und neue Blöcke werden beim Speichern in derselben Datenbanktransaktion geschrieben. Eine fehlgeschlagene spätere Snapshot-Sicherung kann verwaiste Blöcke hinterlassen, aber keine absichtlich ungesicherten Archivverweise erzeugen.

Im Speichern/Laden-Dialog öffnet „Historie im Spiel öffnen“ eine Suche mit Kategorien, Seiten zu höchstens 50 Einträgen und Originaldetails. Vollständige Datei- und Cloud-Sicherungen enthalten weiterhin die Archivblöcke, sodass der Wechsel auf einen anderen Benutzer oder ein anderes Gerät möglich bleibt. Externe Imports akzeptieren keine bloßen lokalen Archivverweise. Fehlende Blöcke und Speicherfehler werden sichtbar gemeldet.

Erfasst werden insbesondere bereinigte Aufträge, Fahrten/Touren, Belege, Buchungen, Ereignisse, Nachrichten, Assistenten-/Delegationsprotokolle sowie eingebundene Kunden-, Personal-, Welt- und Investmenthistorien. Explizite Löschaktionen und sämtliche Zustandsänderungen sind damit noch kein vollständiges Audit-Log. Bereits früher dauerhaft gelöschte Datensätze lassen sich nur aus vorhandenen Sicherungen wiederherstellen.

## Nachweise
- Testlauf: 514 bestanden, 1 übersprungen; 54 Testdateien bestanden, 1 übersprungen.
- Build und Lint erfolgreich. Bestehende Build-Warnungen zu großen JavaScript-Chunks bleiben.
- Neue Tests für Bereinigung innerhalb desselben Befehls, unveränderte Originale, Benutzertrennung, Transaktionsabbruch/Speicherplatzfehler, ältere Slots, Suche/Seitennavigation, beschädigte/fehlende Blöcke sowie vollständigen Export/Import.
- IndexedDB-Transaktionsverhalten über einen Testadapter geprüft; kein echter Browser-End-to-End-Test durchgeführt.
- Reale exportierte Spielstandkopie: 97 aktive LKW, sechs Standorte, drei vollständige Tagesvorläufe. Alle Geschäftszustände nach jedem Tag identisch zur vorherigen Engine; lediglich Archivmetadaten ausgenommen. 5.277 zusätzlich erhaltene Originaldatensätze. Originalspielstand nicht im Repository abgelegt.
- Reproduktionsskript: `bench/history-repository-replay.cjs`; anonymisierte Größen/Zeitmessungen: `replay.json`.

| Tagesvorlauf | Vorher, Engine | Mit Originalerhaltung, Engine | Komprimierung separat |
|---|---:|---:|---:|
| 1 | 5.196 ms | 6.119 ms | 71 ms |
| 2 | 3.584 ms | 3.979 ms | 57 ms |
| 3 | 3.472 ms | 3.751 ms | 60 ms |

Am Ende: 26.409.193 Byte aktives JSON, 89 Archivblöcke mit 1.742.506 komprimierten Byte und insgesamt 42.052 Archivdatensätzen. Einzelne sequenzielle Engine-Vergleiche, keine statistische Performancegarantie. Speicherablage im Replay über In-Memory-Adapter; Browser, IndexedDB, React und Netzwerk nicht zeitlich gemessen. Die verlustfreie Erhaltung kostet Rechenzeit; dieser Schritt behauptet keinen Simulations-Speedup.

## Noch erforderliche Architekturarbeiten
1. Finanzjournal in separate Datenhaltung überführen und korrekte historische Projektionen aufbauen. Der in `audit/architecture-scale` reproduzierte Fehler historischer Filialumsätze ist hier noch nicht behoben.
2. Archivverzeichnis partitionieren, Suchindizes und inkrementelle Cloud-Übertragung ergänzen. Aktuell wächst das Verzeichnis weiter; Suche scannt Blöcke, Cloud-Sicherung lädt noch das Gesamtpaket.
3. Persistenten Simulationsexecutor mit inkrementellen Zustandsänderungen, begrenzten Arbeitsportionen und geeigneten Ereignis-/Dispositionsindizes umsetzen.
4. Streamingfähiges Backupformat: derzeit weiterhin vollständiges JSON-/Gzip-Paket mit 256-MiB-Importgrenze. Dieser Baustein beseitigt nicht sämtliche Grenzen großer Karrieren.
5. Sichere Bereinigung verwaister Archivblöcke unter Berücksichtigung aller Speicherstände. Derzeit bewusst keine automatische Löschung. Browser-Speicherquoten bleiben relevant.
6. Nach diesen Schritten Langzeittests mit mehr als 250 LKW und tausenden Tagen sowie echte Browser-Messungen durchführen.

Die bestehende verzögerte automatische Snapshot-Sicherung bleibt erhalten; ein Geräteabsturz kann weiterhin noch nicht gesicherten Spielfortschritt verlieren. Die Archivablage allein ersetzt keine synchron bestätigte, vollständige Befehls-Transaktion. Keine Garantie „immer unter 20 Sekunden“ aus diesen Tests ableitbar.
