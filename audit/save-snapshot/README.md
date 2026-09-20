# Stabile Speicherpunkte mit weniger Kopierarbeit

## Änderung

`cloneSaveSnapshot` erstellt den Speicherpunkt weiterhin synchron zum Aufruf. Veränderliche Daten werden tief kopiert. Bereits vom Finanztransport rekursiv eingefrorene Journalbelege und Finanzprojektionen werden innerhalb des JS-Prozesses unverändert gemeinsam verwendet. Ein bloßes externes `Object.freeze` genügt nicht: Die Herkunft wird über das bestehende interne WeakSet geprüft. Fehlt dieser Nachweis, bleibt die vollständige strukturierte Kopie erhalten.

Verwendung: laufende lokale Sicherung, rotierende Autosaves, manuelle Slots, Sicherung vor Partiewechsel/Cloud-Wiederherstellung und Cloud-Upload. Die Kopie für mutierende Spielaktionen bleibt vollständig. Speicherformat, Archivdaten, Engine-Regeln und Worker-Protokoll sind unverändert. Keine Veröffentlichung und keine Änderung von Produktionsspielständen.

## Prüfung

616 Tests bestanden, 1 bestehender Test übersprungen. Build und Lint erfolgreich. Sechs neue Tests prüfen Datenidentität, Isolation veränderlicher Felder, Austausch der Finanzdaten nach Erfassung, Alt-/Importzustände, nur oberflächlich eingefrorene Daten, ausgetauschte veränderliche Projektionen und fehlende Finanzfelder. Der bestehende Test-Harness für Provider-Callbacks verwendet die echte neue Funktion; Tests zu Cloud-Konflikten, Queue-Reihenfolge, Kontowechsel und Speicherfehlern bleiben aktiv.

Reproduktion: `node bench/save-snapshot-replay.cjs --save /private/export.json --output audit/save-snapshot/replay.json`.

## Messung mit privater Exportkopie

Nach aktueller Archivverdichtung, neun Kopien je Variante, Node 24.19.0:

| Größe | Vorher | Nachher |
|---|---:|---:|
| Logische JSON-Bytes des zu klonenden Anteils | 15.138.232 | 12.448.055 |
| Median der Kopierzeit | 144,7 ms | 70,6 ms |

Alle Speicherpunkte sind tief wertgleich. Spätere Änderungen am Spielzustand verändern den erfassten Speicherpunkt nicht. Die Originaldatei wurde nicht verändert.

## Grenzen und Rücknahme

Dies ist eine lokale Messung ausschließlich der Erfassung eines Speicherpunkts, keine Browser-, Datenträger-, Cloud- oder Tagesvorlaufmessung. JSON-Größen sind keine Heap-Messung. Das wiederverwendete Journal und die Projektion bleiben vollständig im Speicherpunkt enthalten; IndexedDB und Cloud serialisieren weiterhin den vollständigen Wert. Es werden keine Belege gelöscht oder historische Daten verborgen. Unbestätigte/importierte Zustände nutzen weiterhin die vollständige Kopie. Gemeinsam verwendete Finanzdaten sind nur lesbar; für neue mutierende Verbraucher ist eine vollständige Kopie nötig.

Der Schritt ändert kein Dateiformat und kann unabhängig zurückgenommen werden. Weitere Architekturarbeit bleibt notwendig: großer veränderlicher Zustand, Worker-Übertragung, wachsende Archivverzeichnisse und Finanzprojektionen sowie vollständiges Laden/Exportieren. Eine dauerhafte Tagesvorlaufzeit unter 20 Sekunden ist nicht nachgewiesen.
