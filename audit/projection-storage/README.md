# Komprimierte lokale Finanzhistorie

Ausgangscommit: `ad41f9910c57e93356e5b89b5f23ba17d5618552`.

## Speicherweg

Große Finanzprojektionen (ab 64 KiB, wenn gzip tatsächlich kleiner ist) werden lokal als gzip-Blob mit SHA-256, exakter Rohgröße und einer expliziten Formatkennung gespeichert. Der Block bleibt Bestandteil desselben IndexedDB-Snapshot-Datensatzes. Er wird atomar mit Spielstand, Archivblöcken und aktiver Auswahl übernommen; es gibt keine externe Referenz, keinen zusätzlichen Store und keine neue Garbage Collection.

Die Kompression geschieht vor Beginn der Schreibtransaktion. Nur nachweislich rekursiv durch simulationTransport eingefrorene Projektionen dürfen ihren Blob über eine WeakMap wiederverwenden. Veränderliche oder lediglich äußerlich eingefrorene Importe werden neu gepackt. Bei Kompressionsfehlern wird keine neue Sicherung übernommen; fehlgeschlagene Resultate werden nicht zwischengespeichert. Ohne CompressionStream bleibt die unkomprimierte Speicherung erhalten.

Alle lokalen Ladewege rekonstruieren die Finanzprojektion vor Rückgabe an die Anwendung. Prüfsumme, Format, Rohgröße (begrenzt), Projektionsversion und Anzahl müssen passen. Fehlende oder beschädigte Blöcke werden nicht stillschweigend als leere Historie übernommen. Kleine und alte vollständige Datensätze bleiben unverändert lesbar. Export/Cloud und der geladene aktive Zustand behalten die vollständige bisherige Struktur.

## Kompatibilität und Grenzen

Das lokale Speicherformat ist erweitert. Ein Downgrade des Frontends muss den neuen Leser beibehalten oder die komprimierten Datensätze vorher mit diesem Leser vollständig materialisieren. Der alte Leser kann diese neuen Sicherungen nicht korrekt verwenden. Sicherungen im bisherigen Format werden weiterhin gelesen; kein automatisches Umschreiben aller alten Slots.

Der Arbeitsspeicherzustand und die portable Spielstandsgröße werden dadurch nicht kleiner. Die Verbesserung betrifft die lokale Speicherung dieses Finanzanteils und die Wiederverwendung unveränderter Blobs. Erstes Packen und Laden benötigen Kompression bzw. Dekompression. Physische IndexedDB-Belegung, tatsächliche Browser-Speicherdauer und Gesamt-Tageslaufzeit wurden hier nicht gemessen.

## Validierung und Messung

669 Tests bestanden, ein bestehender Test übersprungen. Geprüft: vollständiger Roundtrip, unveränderte Eingaben, sichere Blob-Wiederverwendung, veränderliche/shallow-frozen Eingaben, Kompressionsfehler, Größenbegrenzung/Prüfsumme/fehlende Blöcke, aktuelle Sicherung, freie Partie, Autosave, manueller Slot, Szenario-Fallback, Nutzertrennung und Erhalt des alten Datensatzes bei Transaktionsabbruch. Die IndexedDB-Tests verwenden einen Transaktions-Vertragsadapter; keine vollständige Browserabnahme.

Synthetische Finanzhistorie mit zwölf Buchungen pro Tag und zehn Filialzuordnungen; exakter Roundtrip. Größen sind logische UTF-8-Metadaten plus Blob-Bytes, keine physische Festplattenmessung. Erster Packvorgang einmal, anschließend Median von fünf Wiederverwendungen derselben unveränderlichen Projektion.

| Tage | Vollständiger Finanz-Snapshot | Mit Blob | Erstes Packen | Wiederverwendung |
|---|---:|---:|---:|---:|
| 100 | 154,253 Byte | 5,606 Byte | 15.02 ms | 0.0045 ms |
| 1000 | 1,553,821 Byte | 49,235 Byte | 24.77 ms | 0.0085 ms |
| 5000 | 7,809,821 Byte | 244,530 Byte | 102.61 ms | 0.0006 ms |

Reproduktion: `node bench/projection-storage-replay.cjs --output /tmp/neuer-ordner`. Diese Finanzhistorie ist synthetisch; es wurden keine 5.000 Spieltage durchsimuliert. Keine Produktionsdaten verändert, keine Veröffentlichung.
