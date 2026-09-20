# Störungsoptionen gemeinsam für Telefonvorschläge berechnen

## Änderung

Die rein lesende Telefonabfrage berechnet den aktuellen Optionssatz einer offenen Störung einmal. Alle Optionen durchlaufen danach dieselben bisherigen Verfügbarkeits-, Ressourcen- und Kostenprüfungen. Die aufwendige Detaildarstellung der Störung wird für diese Optionsabfrage nicht mehr aufgebaut. Daten werden weder über Abfragen hinweg zwischengespeichert noch im Spielstand abgelegt.

`validateDisruptionResolution` und damit die tatsächliche Entscheidungsausführung berechnen Optionen weiterhin frisch aus dem aktuellen Zustand. Vorbereitete Optionen sind nur ein privater Parameter des internen Validators, kein neuer öffentlicher Ausführungspfad. Prüfung auf veraltete Telefonangebote bleibt bestehen. Bereits abgeschlossene oder fehlende Störungen liefern sofort keine Vorschläge.

Identische Änderungen in Frontend-Engine und base44/shared. Keine Produktionsspielstände bearbeitet und kein Frontend veröffentlicht.

## Prüfung

641 Tests bestanden, 1 bestehender Test übersprungen; Build und Lint erfolgreich. Sieben neue Fälle prüfen Gleichheit gegenüber dem bisherigen Ablauf für technische Defekte, Ladeverzögerungen und Personalausfälle, fehlende Touren, Geldmangel, zuvor gesperrte Optionen, entfallene Fahrzeuge, veraltete Kostenvoranschläge und abgeschlossene Störungen. Lesende Vorschlagsabfragen verändern den Zustand nicht.

## Vergleich mit 250 LKW

Vorher und nachher jeweils sechs echte aufeinanderfolgende Tagesvorläufe. Gleicher deterministischer synthetischer Betrieb: 250 LKW, zehn Standorte, 350 Fahrer, 60 Disponenten, täglich 500 Testangebote zusätzlich zum natürlichen Markt, Kapital sowie Fahrzeugzustand/Zufriedenheit gestützt. Quellstand vorher b9d6a4508fb0e02baffc393042120d776b82d310; danach dieser Änderungsschritt.

| Tag | Vorher | Nachher | Lieferungen je Variante |
|---|---:|---:|---:|
| 1 | 3.77 s | 3.69 s | 478 |
| 2 | 4.57 s | 4.09 s | 406 |
| 3 | 7.91 s | 6.28 s | 421 |
| 4 | 11.73 s | 8.69 s | 430 |
| 5 | 20.42 s | 15.63 s | 480 |
| 6 | 17.29 s | 14.94 s | 421 |

Tag 1/2 sind Anlauf, Tag 3–5 die regulären Messtage und Tag 6 ein zusätzlicher CPU-Sampling-Tag. Median der regulären Messtage: 11,73 → 8,69 Sekunden (ca. 26 % weniger). Maximum: 20,42 → 15,63 Sekunden (ca. 23 % weniger).

Alle sechs SHA-256-Prüfsummen der vollständig serialisierten aktiven Zustände einschließlich Archivdeskriptoren sind zwischen vorher und nachher identisch. Die Deskriptoren enthalten die Inhaltsprüfsummen ausgelagerter Originale. Mengen und Lieferungszahlen sind ebenfalls identisch; je Variante 2.636 abgeschlossene Lieferungen. Es wurden keine Spielregeln, Fristen, Störungshäufigkeiten oder Auswahloptionen abgeschwächt.

Reproduktion: `node bench/disruption-fleet-replay.cjs --sourceRoot /path/to/before --output /tmp/comparison-before --commit <stand>` und anschließend ohne `--sourceRoot` in einen separaten Ergebnisordner. Kein zweiter historischer Dauerlauf; der bestehende 200-Tage-Test wurde nicht verändert.

## Grenzen / nächste Engpässe

Einzelne sequentielle Vergleiche verschiedener fortlaufender Tage, keine statistische Dauerzusage. Node 24.19.0, reine Engine-Zeit; Archivkompression separat, keine Browserdarstellung, echtes IndexedDB oder Cloud. Tag 6 ist wegen Profiling nicht im Median/Maximum enthalten. Diese sechs Tage liegen nach der Änderung unter 20 Sekunden; tausende Tage und typische Browser-Gesamtlaufzeiten sind damit nicht belegt.

Der aktive Zustand wächst weiterhin auf rund 24,1 MB. Das neue Profil zeigt wiederholte Ressourcenbindungen (`hasPendingTour`) und den Aufbau von Planungsressourcen als verbleibende große Blöcke. Nächste Schritte müssen deren wiederholte Suche und Langzeit-Datenwachstum untersuchen, ohne die aktuellen Entscheidungsprüfungen abzuschalten.
