# Archivexport: Block nur einmal auslesen

Ausgangsstand: ecc9ae35b5312d2aa8df3065e3098bb0661991d0.

portableHistory liest jeden einzubettenden Blob einmal als ArrayBuffer und verwendet genau diese Bytes für SHA-256-Prüfung und Base64-Kodierung. Zuvor lasen hash und encode denselben Blob separat. Das reduziert die Anzahl vollständiger Block-Lesevorgänge von zwei auf eins. Blöcke werden weiterhin nacheinander bearbeitet; kein globaler Cache und keine parallele Vorladung. Alle anderen Hash-Aufrufer behalten ihre bisherige Blob-Schnittstelle.

Format, Archivindexprüfung, bestätigte Cloud-Referenzen und fehlende/beschädigte Daten bleiben unverändert. Die Änderung betrifft sowohl eigenständige Sicherungen als auch einzubettende Cloud-Blöcke. Originale Blobs und Spielstände werden nicht verändert.

## Nachweis und Grenzen

Gezielte Tests mit 2.001 Originaldatensätzen in drei gzip-Blöcken: genau ein arrayBuffer-Aufruf je eingebettetem Blob (drei statt bisher sechs); Base64-Bytes identisch zur direkten Kodierung; Archiv vollständig wiederherstellbar. Weitere Tests prüfen extern geladene Blöcke, übersprungene bestätigte Referenzen, fehlende Daten und fehlerhafte Prüfsummen. Die vollständige vorhandene Testsuite enthält zusätzlich Export/Import- und Cloud-Archivtests.

Kein Laufzeitbenchmark für den gesamten Export und keine Messung der RAM-Spitze. Es entfällt eine temporäre vollständige Blob-Auslesung pro eingebettetem Block; daraus folgt keine gemessene Halbierung der Laufzeit. SHA-256, Base64, gesamte JSON-Sicherung und gzip bleiben Arbeitsschritte. Langfristige Größenbegrenzung des aktiven Zustands und der Tagesberechnung ist damit nicht abschließend gelöst.

Keine Produktionsdaten geändert, keine Veröffentlichung durch den Agenten. Regressionstests, Lint und Base44-Build werden vor Übergabe geprüft.
