# Disposition, Personal und Cloud-Synchronisation

Stand: 19.09.2026. Ausgangscommit: 9b2ec9a4446329cec84cbb8c649dcdce08a04a30.

## Verhalten
- Bestehende Zusagen erhalten Vorrang vor lukrativen Neuangeboten. Automatische Neuannahmen benötigen einen positiven Zeitpuffer; bereits kritische Bestandsaufträge dürfen weiter gerettet werden.
- Normale Disponenten betreuen 6 Lkw, erfahrene 12, Dispositionsleiter 18. Effizienzschulung erhöht die Kapazität um 2. Grenzen wirken über wiederholte Planungsschritte hinweg; bestehende Touren werden nicht abgebrochen.
- Mindestreserve für Neuannahmen: 30 Minuten normal, 45 Minuten erfahren/effizient, 60 Minuten Leitung. Weiterbildung erweitert außerdem die Kandidatensuche. Planungshorizont 48h, mit Effizienzschulung 72h, Leitung 96h.
- Neuer Kurs Dispositionsleitung & Krisenkoordination für erfahrene Disponenten: 24 Unterrichtsstunden, 1.800 Euro; Wirkung erst nach Abschluss. Bestehende Senior-Weiterbildung bleibt erhalten. Zugang über Personal / Weiterbildung.
- Zweckgebundene Tourkosten sind auch normalen autonomen Disponenten erlaubt, innerhalb der bestehenden Ausgaben-, Tagesbudget- und Liquiditätsgrenzen. Allgemeine Ausgabenbefugnisse werden nicht erweitert.
- Erkrankte/abwesende Fahrer und laufende Weiterbildung werden bei der Auswahl berücksichtigt. Störungsvertretung priorisiert qualifizierte Leitung; automatische Umbesetzung/Neuplanung kann unmittelbar weiterlaufen.
- Personalansichten zeigen Auslastung, Planungspuffer und zugeordnete Lieferergebnisse der letzten sieben Spieltage. Historische Kundenzufriedenheit wird nicht zurückgesetzt.
- Cloud: konkrete Fehlermeldung, letzter erfolgreicher Upload, erneutes Speichern über den echten Uploadpfad. Maximal drei Versuche nur bei definierten vorübergehenden Fehlern. Revision, lokale Sicherung und Sitzungsschutz bleiben erhalten; Konflikte werden nicht automatisch überschrieben.

## Prüfung
- Gesamtsuite: 471 bestanden, 1 bereits vorhandener Real-Save-Replay ohne Fixture übersprungen; 50 Testdateien.
- Produktionsbuild und ESLint erfolgreich.
- Typecheck: 45 bereits vorhandene Diagnosen, keine zusätzlichen gegenüber dem vorhandenen Baseline-Protokoll nach Normalisierung der Zeilennummern. Typecheck insgesamt weiterhin nicht grün.
- Neue Tests prüfen Ablehnung verspäteter Neuangebote, Rettung bestehender Zusagen, Puffer, Auftragspriorität, Kapazität über wiederholte Aufrufe, Ausbildung, Budgetschutz, Fahrerkrankheit, zusätzliche Disponenten sowie Cloud-Wiederholung und Konfliktschutz.
- Alle sieben geänderten Simulationsmodule sind in src/lib/simulation und base44/shared identisch.

## Leistung und Grenzen
Kontrollierter Einzel-Benchmark: 100 aktive Lkw, 100 Fahrer, 10 normale Disponenten, 500 Aufträge, Zustand 869.701 Bytes. Eine Stunde: 646 ms; ein Tag: 4.066 ms; 151 Lieferungen im Tageslauf. Dies ist die Engine-Laufzeit im Sandbox-Harness, keine Messung vom Browser-Klick bis zur fertigen Oberfläche und kein Nachweis einer garantierten Pünktlichkeitsquote. Der individuelle problematische Spielstand lag für diesen Test nicht vor. Die konkrete Ursache des abgebildeten Cloudfehlers ist ohne dessen Fehlerdetails nicht abschließend bestimmt.

Die Änderungen liegen im Base44-Projekt. Veröffentlichung der Webseite erfolgt anschließend über Base44 Publish.
