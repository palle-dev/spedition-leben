# Getrennte Cloud-Archivspeicherung — 2026-09-20

Baseline: 06ad4ad97c3d46153f6d82683bf83b87c285a361.

## Verhalten
GameArchiveBlock speichert gzip/base64-Originalblöcke unveränderlich je Eigentümer
und SHA-256-Inhaltskennung. Alle direkten Entity-Operationen sind RLS-gesperrt.
Nur Backend-Service-Role schreibt; jeder Abruf prüft Eigentümer, Deskriptor und
SHA-256. Vorhandene GameState-Dokumente bekommen archive_blocks als servereigene
Zuordnung Inhaltskennung → Entity-ID; im Zustand bleiben Archivdeskriptoren.

cloudSync stage schreibt zuerst alle neuen Blöcke. Erst nach Bestätigung schreibt
das bestehende atomare Revisionsupdate Snapshot UND Zuordnung zusammen.
Veraltete Revision: 409. CAS-Fehler: alter Snapshot unverändert; bereits geschriebene
Blöcke dürfen unverknüpft bleiben und werden bei Wiederholung wiederverwendet.
Kein Block wird beim Speichern/Löschen eines Spielstands gelöscht (andere Slots
und laufende Schreibvorgänge könnten ihn verwenden). Parallele Erstanlagen können
identische Duplikate hinterlassen, aber keine unvollständigen Referenzen.
Bestätigte Referenzen des bisherigen servereigenen Manifests benötigen keinen
erneuten Blockzugriff. Vom Client gelieferte Referenzzuordnungen werden ignoriert.

Bestehende eingebettete Archive bleiben lesbar. Übernahme erfolgt beim nächsten
regulären Speichern, inklusive Transportreferenzen aus dem vorherigen Inkrement.
Erstanlagen und alte Clients dürfen vollständige Payloads schicken.
cloudSync/load und gameCommand/load geben weiterhin vollständige Originaldaten
zurück. Serverseitige gameCommand-Befehle erhalten ebenfalls vollständige Daten;
dieser ungenutzte Legacy-Schreibweg kann Archive wieder einbetten.
Keine Frontendänderung und keine Änderung der lokalen Dateisicherung erforderlich.

## Prüfung
569 Tests erfolgreich, 1 vorhandener Test übersprungen; Build und ESLint erfolgreich.
Datenbankersatz prüft Blöcke, Zugriffstrennung, Prüfsummen, Migration, abgebrochene
Archivschreibung, fehlgeschlagenes CAS, erneute Übernahme, vollständiges Laden
durch beide Endpunkte und Aufbewahrung nach Slot-Löschung.
Kein Testbeleg für tatsächliche produktive RLS oder DB-Dauerhaftigkeit/Atomarität.

bench/cloud-blocks-replay.cjs --save /private/export.json --output /tmp/metrics.json
liefert auf der Exportkopie mit 97 aktiven LKW und sechs Standorten:
- 39 Blöcke mit 37.908 Originaldatensätzen, 1.443.583 komprimierte Bytes.
- Vollständig eingebetteter Payload: 24.800.618 Bytes.
- Snapshot einschließlich Referenzzuordnung: 22.878.465 Bytes
  (Test-Entity-IDs; produktive ID-Längen verändern den kleinen Manifestanteil).
- Unverändertes Folgespeichern: 0 Block-Lesezugriffe / 0 Block-Schreibzugriffe.
- Wiederhergestellter vollständiger Snapshot tiefengleich zum Original.
- Keine Simulation vorgerückt, keine produktiven Saves gelesen oder verändert.

## Grenzen und Betrieb
Backend-/Entity-Dateien synchronisieren in Base44 automatisch.
Erstmigration benötigt einen Schreibvorgang je Block und kann länger dauern.
Laden rekonstruiert weiterhin das gesamte Archiv; bedarfsgerechter Cloud-Abruf,
gezielte Datenabfragen und begrenzte Upload-Batches bleiben nächste Ausbauschritte.
Aktiver Zustand (~22,88 MB), Archivmanifest und Auswertungsprojektionen wachsen
weiterhin. Es gibt noch keinen langfristig begrenzten Snapshot und keine
<20-Sekunden-/250-LKW-/Tausende-Tage-Garantie. Keine Browser-/Netzwerkzeit gemessen.
Wiederholte Speicherung kann alle bestätigten Blöcke auslassen; neue/geänderte
Blöcke bleiben einzeln geprüft. Liste lädt weiterhin GameState-Dokumente.

ROLLBACK: Nach erster Übernahme keinen älteren Backend-Code einsetzen, der
archive_blocks nicht kennt. Erst vollständige Archivdaten materialisieren oder
den kompatiblen Loader beibehalten. Archiv-Entity/Blöcke niemals vorab löschen.
Dies ist eine Vorwärtsmigration, kein Auftrag zur Bearbeitung produktiver Daten.
