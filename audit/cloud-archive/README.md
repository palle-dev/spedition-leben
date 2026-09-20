# Inkrementeller Cloud-Archivtransport — 2026-09-20

Baseline: 0406128f96ff368dca37648f560334febd23ff85.

## Änderung
Nach ausdrücklich bestätigtem Speichern (archive_delta: 1) behält der Client nur
Archivdeskriptoren und Revision, höchstens für acht Benutzer/Spielstand-Paare.
Ein Folgespeichern derselben Revision/Partie überträgt unveränderte Archivblöcke
als Referenzen. Neue/geänderte Blöcke werden einzeln aus IndexedDB gelesen,
SHA-256-geprüft und kodiert. Es wird nicht mehr das gesamte Archiv vorab geladen.

Der Handler rekonstruiert vor dem atomaren Revisionsupdate einen vollständigen
Snapshot aus dem bereits gespeicherten, eigentümergeprüften Spielstand. Fehlende
oder veränderte Referenzen führen zu 400 ohne Speicherung. Veraltete Revisionen
und konkurrierende Schreiber bleiben 409-Konflikte; kein blindes Überschreiben.
Neuanlagen müssen vollständig sein. Nach Konflikt erlischt die Bestätigung.
Alte Clients und Server bleiben kompatibel: Ohne Capability/Bestätigung sendet
der neue Client vollständig. Erster Save nach Neuladen normalerweise ebenfalls.
Laden und Datei-Export bleiben vollständig. Keine neue Entity, keine Löschung.

## Nachweis
- 555 Tests bestanden, 1 bestehender Test übersprungen; Build und ESLint erfolgreich.
- Handler-Vertragstests mit Datenbankersatz: Eigentum, Referenzauflösung,
  fehlende/geänderte/fremde Blöcke, Neuanlage, vollständiges Laden, CAS-Konflikt.
- Clienttests: explizite Bestätigung, Legacy-Server, Konflikt, Benutzer-/Partie-/
  Revisions-/Deskriptorwechsel, neue Blöcke, Prüfsummenfehler.
- bench/cloud-archive-replay.cjs auf privater Exportkopie, 97 aktive LKW/6 Standorte.
  Aufruf: node bench/cloud-archive-replay.cjs --save /private/export.json --output /tmp/metrics.json
- Vollständiger JSON-Payload: 24.800.618 Bytes; bestätigtes Folgespeichern:
  22.875.404 Bytes. Ersparnis 1.925.214 Bytes (7,76 %).
- 37.908 archivierte Originaldatensätze, 1.443.583 komprimierte Bytes.
- Rekonstruierter Snapshot tiefengleich zum vollständigen Payload.
- Keine Simulation vorgerückt, keine Cloud-Spielstände oder Produktionsdaten geändert.

## Grenzen / nächste Architekturarbeit
Dies reduziert den Upload und lokale Archivarbeit, NICHT die Cloud-Snapshotgröße.
Backend liest/schreibt weiterhin vollständige GameState-Dokumente; Cloud-Laden,
aktive Daten und Archivmanifest wachsen weiterhin. Separate, eigentümergeschützte
Archivspeicherung mit bestätigtem Manifest-Commit bleibt nötig.
Buchhaltung 10,80 MB, Aufträge 5,99 MB, Touren 2,00 MB dominieren aktive Felder.
Keine echte Browser-/Netzwerkzeit, keine produktive Datenbank-Atomaritätsprüfung,
kein Nachweis für Tausende Tage oder <20 Sekunden. Kein Performanceversprechen.
Backend-Dateien synchronisieren in Base44 automatisch; Frontend manuell veröffentlichen.
