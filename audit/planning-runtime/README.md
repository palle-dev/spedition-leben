# Laufzeitoptimierung der Planung

Stand 20. September 2026; Ausgangscode b3ede26. Keine Veröffentlichung, keine produktiven Spielstände geändert.

## Messung und Eingriff
CPU-Stichproben eines kontrollierten Tagesvorlaufs der realen Exportkopie (97 aktive LKW, sechs Standorte) zeigen den Schwerpunkt in Tourensuche und Angebots-Machbarkeitsprüfung. Der Ereignisscheduler lag in diesem Profil deutlich dahinter. `profile.json` enthält die aggregierten Selbstzeiten in Mikrosekunden; Profiling-Overhead und einzelne Läufe erlauben keine allgemeingültige Prozentzuordnung.

1. Ein vergeblicher Zugriff auf den vollständigen, temporären Fahrtenindex löst während der Planung keine erneute lineare Suche durch alle historischen Fahrten mehr aus. Außerhalb des begrenzten Kontexts bleibt der direkte Zugriff erhalten.
2. Vorschlagssuche verwendet Fahrzeug-/Fahrerindizes gemeinsam statt doppelt. Fahrzeugabfragen verwenden den bestehenden Index. Unveränderliche Fahrereignung und zukünftige Standorte werden einmal pro Suche bestimmt; bereits verwendete Fahrer werden weiterhin je Fahrzeug ausgeschlossen.
3. Jede normale Angebotswelle erstellt einen vorübergehenden Index der Fahrer nach Standort und ihrer Verfügbarkeit. Die Paarverfügbarkeit entspricht weiterhin exakt dem Maximum beider Einzelverfügbarkeiten. Anfahrzeiten werden pro Abholort innerhalb dieser Welle wiederverwendet. Nach Abschluss oder Fehler wird der Kontext entfernt bzw. der äußere Kontext wiederhergestellt.

Keine Änderung an Suchlimits, Fristen, Arbeitszeiten, Reihenfolge, Zufallszahlen oder Bewertungsregeln. Keine über Ereignisse hinweg wiederverwendeten Planungsdaten. Historien werden nicht gelöscht. Die temporären Kontexte sind WeakMaps außerhalb des Spielstands.

## Nachweise
530 Tests bestanden, ein bestehender Test übersprungen; Build und Lint erfolgreich. Bekannte Bundle-Größenwarnungen bleiben. Neue Tests prüfen insbesondere authoritative Index-Misses, Fehlerbereinigung, verschachtelte Kontexte, fachlich unveränderte Tourenvorschauen und geänderte Ressourcen zwischen Marktwellen. Die bisherigen leeren `_vehicleMap`/`_driverMap`/`_orderMap`-Hilfsfelder der Engine bleiben unverändert; der Adapter entfernt sie wie zuvor.

`bench/planning-runtime-replay.cjs` führt dieselben Befehle mit altem und neuem Code auf Kopien desselben vorbereiteten Exports aus. Nach jeder Simulation und nach der gleichen Archivbereinigung wird der gesamte Zustand tief verglichen, einschließlich RNG, Entscheidungen, Belegen und Archivwarteschlangen. Alle Vergleiche bestanden. Die Originaldatei ist nicht Bestandteil des Repositorys.

| Vorlauf | Vorher | Nachher |
|---|---:|---:|
| 1 Stunde | 472 ms | 334 ms |
| Tagesvorlauf 1 | 7.779 ms | 5.382 ms |
| Tagesvorlauf 2 | 4.419 ms | 3.396 ms |
| Tagesvorlauf 3 | 3.853 ms | 3.123 ms |

Die drei beobachteten Tagesläufe waren rund 19–31 % schneller. Einzelne sequenzielle Messungen mit wechselnden Spieltagen, keine statistisch belastbare allgemeine Beschleunigungszusage. Gemessen ist nur die Engine. Worker-Transport, Browserdarstellung, IndexedDB, Komprimierung und Cloud sind nicht Teil dieser Zeiten. Kein Beleg für Tagesvorläufe unter 20 Sekunden auf beliebiger Hardware oder bei mehr als 250 LKW über tausende Tage.

## Nächster Architekturbaustein
Die Oberfläche überträgt weiterhin den vollständigen aktiven Zustand an den Worker und erhält einen vollständigen Zustand zurück. Ein persistenter Executor mit bestätigten Revisionen, sauberem Zurücksetzen nach Fehlern und Spielstand-/Benutzerwechseln bleibt offen. Ebenso noch offen: begrenzte Arbeitsportionen, weitere ereignisbezogene Indizes, partitionierte Finanzprojektionen/Archivverzeichnisse, inkrementelle Cloud-Sicherung und Streaming-Backup. Diese Änderung reduziert Rechenaufwand, ersetzt jedoch nicht diese Architekturarbeiten.
