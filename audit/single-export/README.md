# Export mit einmaliger JSON-Serialisierung

Ausgangsstand: 81f5d22fbf43608c354baced44e69b4fb2539dc7.

exportSave verwendet den für Prüfsumme und UTF-8-Größe bereits erzeugten JSON-Text direkt als state im v2-Exportumschlag. Die zweite vollständige Serialisierung entfällt. Metadaten werden weiterhin mit JSON.stringify korrekt kodiert. Archiv-Vollständigkeitsprüfung, Sicherungsformat und Import bleiben unverändert. Der Export verwendet damit exakt den Text, dessen Prüfsumme er enthält. Getter werden nur einmal ausgewertet; normale JSON-Spielstände ergeben dieselben Bytes wie zuvor.

## Kontrollierte Messung

Node v24.19.0, private Exportkopie mit 45.227.615 Bytes, ein Aufwärmpaar und fünf abwechselnd angeordnete Messpaare. Gemessen: exportSave **einschließlich anschließender Blob-Erzeugung**, damit die Materialisierung des zusammengesetzten Textes nicht ausgeklammert wird. Median vorher 924,96 ms, danach 652,56 ms: 29,45 % weniger. Jede Exportdatei bytegenau gleich zur alten Implementierung; Originalzustand unverändert. results.json enthält ausschließlich Messdaten.

Nicht enthalten: Archivzusammenstellung, gzip, Dateizugriff, tatsächliche Worker-Wartezeit, Browserdarstellung, Speichern oder Tagesberechnung. Keine Aussage über vollständige Exportdauer, RAM-Spitzen oder Langzeit-Simulationsleistung.

Reproduktion: `node bench/single-export-replay.cjs --save /private/export.json --baseline /path/to/before --output /tmp/new-export-run`. Baseline enthält src/lib/persistence.js vom Ausgangsstand. Das Skript lädt ausschließlich die Exportfunktion und ihre Prüfsummenfunktion aus beiden Versionen.

## Absicherung

Neue Tests: bytegenaues v2-Format inklusive Unicode, Steuerzeichen, nicht-endlichen Zahlen und eingebettetem Archiv; Import-Kompatibilität und unveränderter Quellzustand; einmalige Getter-Auswertung mit passender Prüfsumme; Ablehnung fehlender Archivdaten, zyklischer Daten und BigInt. Gesamtsuite, Lint und Base44-Build werden vor Übergabe geprüft. Keine Produktionsspielstände verändert, keine Veröffentlichung durch den Agenten.
