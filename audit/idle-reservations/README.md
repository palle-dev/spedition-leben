# Gebündelte Reservierungsprüfungen

## Änderung

Für die Stillstandsgründe eines Disponenten wird die Menge reservierter Fahrzeuge/Fahrer einmal und bei Bedarf aufgebaut. Dies geschieht nach allen Tourenbestätigungen dieses Disponenten. Die anschließende Schleife schreibt nur Stillstandsannotationen und verändert keine Touren. Sind alle Poolfahrzeuge unterwegs oder gerade zugewiesen, entfällt der Aufbau.

Auch jede Ersatzfahrzeug-/Ersatzfahrersuche erhält einen eigenen synchronen Reservierungsprüfer. Er nutzt einen bereits bestehenden gültigen lesenden Planungskontext oder baut beim ersten benötigten Test eine eigene Menge auf. Diese Menge lebt nur während der konkreten Suche. Die nächste Suche berücksichtigt neue Bestätigungen, Stornierungen und abgeschlossene Einsätze frisch.

Die Kriterien sind dieselben wie bisher: aktive/geplante Tour, mindestens ein geplanter Einsatz oder eine geplante Rückfahrt; Bindung gilt für Fahrzeug und Fahrer. Kein dauerhafter Cache im Spielstand. Die tatsächliche Disposition und Störungsentscheidung bleiben frisch validiert. Keine Produktionsspielstände bearbeitet, kein Frontend veröffentlicht. Änderungen in src und base44/shared identisch.

## Nachweise

646 Tests bestanden, 1 bestehender Test übersprungen; Build und Lint erfolgreich. Fünf neue Tests vergleichen Einzel- und Sammelprüfung für Tour-/Einsatzstatus, Rückfahrten, neue Zusagen, Stornierungen, abgeschlossene letzte Einsätze, getrennte Suchvorgänge und unveränderte Spielstände.

Zunächst wurde ausschließlich die Prüfung der Stillstandsgründe gebündelt. Dieser Zwischenvergleich zeigte keinen klaren Gewinn (Median 8,27 → 8,36 s; Maximum 15,24 → 15,06 s). Deshalb wurde zusätzlich die gleichartige rein lesende Ersatzsuche gebündelt. Die folgende Tabelle beschreibt den finalen Schritt gegen die unveränderte Ausgangsversion:

| Tag | Vorher | Final | Lieferungen je Variante |
|---|---:|---:|---:|
| 1 | 4.18 s | 3.92 s | 478 |
| 2 | 4.19 s | 4.13 s | 406 |
| 3 | 5.86 s | 6.13 s | 421 |
| 4 | 8.27 s | 8.26 s | 430 |
| 5 | 15.24 s | 12.51 s | 480 |
| 6 | 14.60 s | 11.78 s | 421 |

Alle sechs SHA-256-Prüfsummen des vollständigen serialisierten aktiven Zustands einschließlich Archivdeskriptoren stimmen überein; diese enthalten Inhaltsprüfsummen ausgelagerter Originale. Mengen und Lieferungszahlen sind identisch, jeweils 2.636 abgeschlossene Lieferungen.

Median der regulären Messtage 3–5: 8,27 → 8,26 s, praktisch unverändert. Maximum: 15,24 → 12,51 s, rund 18 % weniger in diesem Vergleich. Tag 3 ist geringfügig langsamer; keine gleichmäßige Beschleunigung aller Tage behauptet.

## Methode und Grenzen

Quellstand vorher: 4a08bc011862beec5ee43829cefe47f64ee2550c. Node 24.19.0. Synthetischer Betrieb mit 250 LKW, zehn Standorten, 350 Fahrern und 60 Disponenten; Kapital, Fahrzeugzustand und Zufriedenheit gestützt; täglich 500 synthetische Angebote plus natürlicher Markt. Engine und echte Lieferungen aktiv. Zwei Anlauftage, drei reguläre Messtage, ein zusätzlicher CPU-Sampling-Tag. Einzelne sequentielle Vergleiche, keine statistische Dauerzusage. Der Profiling-Tag ist vom Median/Maximum ausgeschlossen.

Reine Engine-Zeit, Kompression separat; keine Browserdarstellung, echte IndexedDB- oder Cloud-Zeit. Die sechs frühen Tage sind kein Nachweis für tausende Spieltage. Aktiver Zustand bleibt rund 24,1 MB an Tag 6. Historischer 200-Tage-Lauf unverändert.

Reproduktion: `node bench/reservation-fleet-replay.cjs --sourceRoot /path/to/before --output /tmp/before-run --commit <stand>` und anschließend ohne `--sourceRoot` in einen separaten Ordner. Der nächste Schwerpunkt bleibt die Skalierung mit dem Spielalter und der Aufbau von Planungsressourcen.
