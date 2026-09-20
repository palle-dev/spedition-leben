# Verfügbarkeit mit lokalem Fahrtenindex

Ausgangsstand c2aa73912afda3c9d52dbcdd3fc0ea1b358d3feb.

computePlanableFleetN und withMarketResources verwenden pro synchroner Berechnung einen neuen createAvailabilityReader. Bei der ersten Anfrage für eine laufende Fahrt erzeugt er einen Index nach Trip-ID und nach Fahrer-ID für laufende Fahrten. Freie Ressourcen benötigen keinen Index. Die bisherigen ersten Treffer bleiben erhalten. Die Zeitberechnung selbst wird mit earliestAvailable geteilt: Fahrtende, Wartungsende und Ruhezeit werden unverändert verrechnet. Keine Speicherung am Spielzustand und kein Wiederverwenden zwischen Simulationsevents. Client und shared-Version sind identisch.

## Prüfung

Gezielte Tests vergleichen Kombinationen aus freien Ressourcen, laufenden Fahrten, fehlenden IDs, doppelten IDs, Wartung und Ruhezeiten mit der alten Einzelabfrage. 100 wiederholte Abfragen lesen die Fahrtenliste nur einmal; ohne laufende Fahrten gar nicht. Neue Berechnungen sehen ersetzte und entfernte Fahrten. Bestehende Flotten-Orakeltests bleiben Teil der Gesamtsuite.

Kontrollierter Tagesvergleich: synthetische 250 LKW, zehn Standorte, identischer interner Zustand nach Tag 21. Vorher 18,108 s, danach 17,580 s (ein Lauf je Stand, etwa 2,9 Prozent weniger). Das ist ein Einzelvergleich und kein belastbarer allgemeiner Laufzeitgewinn. Vollständige Ergebnis-Hashes sind identisch: 967e150bb822819448760f4f2604efdbf563475b8005fdb6e9b8d28c657823c1. Jeweils 292 echte simulierte Lieferungen, gameTime 32160. Messwerte und Fixture-Hash in results.json.

Gemessen mit Node v24.19.0, bench/age-lookup-replay.cjs und identischem Fixture. Nur Engine; kein Browser, Archivlesen, Speichern, Kompaktieren oder Cloud. Der zusätzliche Tag verwendet den natürlichen Markt. Das Fixture ist kein portabler Spielstand. Kein Nachweis für tausende Tage oder stets unter 20 Sekunden Browser-Gesamtdauer. Produktionsspielstände unverändert, keine Veröffentlichung durch den Agenten.

Vor Übergabe werden Vollsuite, Lint und Base44-Build geprüft.
