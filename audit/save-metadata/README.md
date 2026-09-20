# Kleine Metadaten für lokale Sicherungslisten — 2026-09-20

Baseline: 2f9e6cea7f1839198e0e495c04ccc8b88592175c.

Nach jeder automatischen Sicherung las getAllAutosaveMetas drei vollständige
Snapshots nur für deren savedAt-Werte. Auch listManualSlots las für jeden Slot
das gesamte Spiel. Mit ~15 MB aktivem Zustand verursacht allein die Aktualisierung
der drei Zeitstempel ~45 MB Datenlesen/Structured-Clone-Arbeit.

idbPut schreibt nun bei Snapshot-Datensätzen einen kleinen snapshot_metadata:
Begleitdatensatz aus Formatkennung, savedAt und optionalem Namen in DERSELBEN
Transaktion. Metadatenabfragen lesen diesen statt des Zustands. idbDelete löscht
beides atomar. Synchrone Fehler brechen die gesamte Transaktion explizit ab.
Bestehende Spielstände und tatsächliches Laden/Import/Export bleiben unverändert.
Fehlende/ungültige Metadaten: kompatibler Rückfall auf den alten Snapshot.
Kein Zurückschreiben nach Legacy-Lesezugriff; dadurch kein Wettlauf mit einer
neuen Speicherung. Alte Slots erhalten Metadaten bei ihrer nächsten Speicherung.

## Nachweise
601 Tests bestanden, 1 vorhandener Test übersprungen. Build und ESLint erfolgreich.
Tests: drei Autosave-Zeitstempel ohne Snapshot-Reads, manuelle Listen ohne
Snapshot-Reads, Legacy-Fallback, Benutzer-/Szenariotrennung, gemeinsamer Commit,
gemeinsames Löschen, Transaktionsabbruch und synchroner Metadaten-Schreibfehler.

bench/save-metadata-replay.cjs --save /private/export.json
  --baseline /baseline/src/lib --output /tmp/metrics.json

Drei Autosaves mit dem kompakten Zustand der privaten Exportkopie (97 LKW):
- vorher drei Vollzustände, 45.414.798 serialisierte JSON-Bytes
- nachher drei Begleitdatensätze, 159 serialisierte JSON-Bytes
- gleiche Ergebnisdaten, keine Snapshot-Reads nachher
- lokaler Adapter mit echtem structuredClone: ~410 ms → ~0,6 ms

## Grenzen
Kein echter Browser-/IndexedDB-Datenträgertest. JSON-Bytes sind eine Größenmetrik,
keine exakte Heap- oder Datenbankdateigröße. Keine Verbesserung der eigentlichen
Tagesberechnung, Cloud-Übertragung oder des vollständigen Ladens nachgewiesen.
Vorhandene Slots ohne Begleitdaten laden für die Metadaten noch den Snapshot.
listManualSlots ermittelt weiterhin alle Schlüssel, darunter Archivschlüssel.
Der aktuelle Zustand wird weiterhin unter current und active_current doppelt
gespeichert; dies bleibt separat zu überarbeiten.
Ein älterer Client, der einen neuen Snapshot ohne Begleitdatenpflege schreibt,
kann eine veraltete Listenzeit hinterlassen; der Snapshot selbst bleibt lesbar.
Aktuelle Version auf allen geöffneten Spiel-Tabs verwenden.

Keine Produktionsspielstände verändert, keine Veröffentlichung vorgenommen.
Frontend manuell veröffentlichen.
