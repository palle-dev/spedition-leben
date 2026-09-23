# Cloud-Synchronisation

Die Cloud speichert vom Browser berechnete Spielstände. Die Simulation läuft weiterhin im Worker.

## Zuständigkeiten

- `gameContext.jsx`: aktive Benutzersitzung, Tab-Schreibsperre, Spielzustand und gemeinsame Aktivierung geladener Spielstände.
- `useCloudGameSync.js`: Uploadqueue, Cloud-Liste und deren Ladezustand, Cloud-Laden/Löschen, Konfliktaktionen, Revisionsprüfung beim Start, Online-/Offline-Ereignisse und automatischer Upload alle drei Minuten.
- `cloudSync.js`: Base44-Aufrufe, Fehlerverträge, Wiederholungen und Queue-Implementierung.
- `useLocalSaveWriter.js` / `useGameSaveActions.js`: lokale Speicherung und Speicheraktionen.

Der Cloud-Hook erhält stabile Sitzungsfunktionen, React-Setter und Refs vom Provider. Er besitzt seine Uploadqueue und Listenabfragen selbst. Der Provider verwendet dieselben Sync-Metadaten-Refs für die atomare Aktivierung eines geladenen Stands und lokale Sicherungen.

## Zu erhaltende Regeln

1. Uploads und Löschaktionen werden durch dieselbe Queue serialisiert. Die bestätigte Revision wird innerhalb der Queue übernommen, bevor der nächste Auftrag seine Metadaten liest.
2. Uploads arbeiten mit einem Snapshot vom Aufrufzeitpunkt. Neue Änderungen behalten ihre Änderungsmarkierung.
3. Sitzungsgeneration, aktive Partie und Tab-Sperre werden vor dem Schreiben und vor der Übernahme von Antworten geprüft. Die Queue wird beim Partiewechsel nicht ersetzt.
4. Nur die jüngste Listenabfrage darf die Cloud-Liste aktualisieren. Beim Benutzerwechsel setzt der Provider über `resetCloudState` die Liste zurück und entwertet ausstehende Listenabfragen.
5. Cloud-Laden verwendet weiterhin die gemeinsame `activateState`-Funktion. Die Revisionsprüfung beim Start meldet einen neueren Cloud-Stand, lädt ihn aber nicht automatisch.
6. Ein Versionskonflikt wird nicht automatisch überschrieben. „Lokal behalten“ liest zuvor die aktuelle Cloud-Revision; „Cloud behalten“ sichert die lokale Fassung; „Beide behalten“ erzeugt eine neue Partie-ID.
7. Timer und Browser-Listener werden beim Unmount entfernt.

Die Tests in `tests/cloud-sync-hook.test.ts` führen den tatsächlichen Hook mit kontrollierten IO-Grenzen aus. Ergänzend sichern `tests/save-safety.test.ts` und die vorhandenen Cloud-/Archivtests die bestehenden Speicherverträge ab. Produktive Spielstände werden dafür nicht verwendet.
