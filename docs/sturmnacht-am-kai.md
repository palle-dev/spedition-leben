# Die Nacht am Kai – spielbare Notfallschicht

Die optionale Transportfolge erscheint im Büro und in der Spielwelt, wenn das dritte Hauptkapitel noch unentschieden ist und Hansen unabhängig ist. Bereits gewählte Kapitel und aktive Szenarien werden nicht verändert.

## Entscheidung und Zeitfenster

Die nächste Öffnung der Hafenrampe liegt um 20:00 Spielzeit (bei Zusage ab 20:00 am folgenden Spieltag). Vor der Zusage warten Geschichte und Angebot. Danach sind Abholung und Fristen unveränderlich.

| Auftrag | Strecke | Fracht | Vergütung | Lieferfrist ab Rampe |
| --- | --- | --- | ---: | ---: |
| Eigener Kunde | Hamburg → Bremen | 6 t Ersatzteile | 950 € | 6 Stunden |
| Annas Hilfslieferung | Hamburg → Bremen | 6 t Pumpenzubehör | 420 € | 4,5 Stunden |

Spieler wählen den eigenen Auftrag, Annas Auftrag oder beide. Nur gewählte Aufträge werden verbindlich angenommen. Nicht zugesagte Arbeit wird anderen Betrieben überlassen, ohne Umsatz oder Stornokosten zu erfinden. Beide Zusagen erfordern mindestens zwei geeignete Lkw und zwei angestellte Fahrer; konkrete Verfügbarkeit, Standort und Arbeitsbudget müssen in der Disposition geprüft werden.

Der Sturm ist durch die zeitweise gesperrte Rampe dieser Ladungen modelliert. Es gibt keine globale Straßensperre oder zusätzliche Wetterwahrscheinlichkeit. Normale Fahrt-, Ruhezeit-, Storno-, Verspätungs- und Störungsregeln gelten. Bei Standardfahrt ab Hamburg liegt die Ankunft um 23:55; Annas Frist endet um 00:30, die eigene um 02:00.

## Folgen aus tatsächlichen Transporten

Jede Zusage wird separat ausgewertet. Pünktliche eigene Lieferung: Verlässlichkeit +3. Pünktliche Hilfe: Verlässlichkeit +5 und Hansen +10. Verspätung: Verlässlichkeit −3, bei Anna zusätzlich Hansen −4. Nichtlieferung: Verlässlichkeit −5, bei Anna zusätzlich Hansen −8. Werte werden begrenzt; die Anzeige nennt die tatsächlich angewandte Änderung.

Vergütung stammt ausschließlich aus normalen Transportbuchungen. Die Story bucht keine zusätzliche Prämie. Ein technischer Defekt lässt die Zusage offen und erlaubt eine Ersatzfahrzeugplanung. Fehlende Aufträge zählen nicht als Erfolg. Erst wenn alle Zusagen geliefert oder beendet sind, kann die Nacht abgeschlossen werden.

Danach folgt „Wem gehört der Norden?“. Die ursprünglichen pauschalen Kapitelkosten und verzögerten Belohnungen werden nicht zusätzlich ausgeführt. Rückblick und Weltchronik erhalten die echten Ergebnisse mit Fahrer, Lieferzeit und Vergütung. Annas Verhältnis beeinflusst das bestehende Bündnisangebot.

## Architektur und Absicherung

- Eigenes Modul: src/lib/simulation/stormNight.ts; identische Backend-Kopie base44/shared/stormNight.ts.
- Oberfläche: StormNightPanel im Büro und in der Spielwelt; StormNightGuide priorisiert die früheste offene Frist.
- Befehle: startStormNight und finishStormNight; gegen Wiederholung und parallele Kapitelentscheidung abgesichert.
- Persistenz: world.stormNight, inklusive einzelner Ergebnisse; bestehender Speicher-/Archivpfad.
- 14 neue Simulationstests und 7 Oberflächentests. Reale Fahrten nach Anna/NordSprint, drei Entscheidungen, Parallelfahrten, Ruhezeit-Verspätung, Storno, gemischte Ergebnisse, echte Panne/Ersatz-Lkw, Migration, Archivierung, Wiederholung und Backend-Gleichheit.
- Gesamtsuite: 941 bestanden, einer übersprungen. Typprüfung, Lint, Build und Diff-Prüfung erfolgreich.
- Statische Darstellung echter React-Komponenten mit Produktions-CSS auf Desktop und schmalem Bildschirm geprüft. UI-Interaktion zusätzlich in DOM-Tests geprüft. Liveabnahme der veröffentlichten Version steht aus.

## Liveabnahme nach Veröffentlichung

Die Cloud-Testpartie „Codex Test – NordSprint live geprüft“ steht bei Tag 2, 16:00, pausiert, 77.079,04 € Firmenkonto. Das Hauptkapitel ist offen. „palle“ nicht laden oder verändern.

Beide Zusagen wählen und zwei passende Teams disponieren; Petra hat nach NordSprint nur zehn Arbeitsminuten übrig. Pannen über vorhandene Störungsverwaltung/Ersatzfahrzeug lösen. Auf beide Transportergebnisse, Umsatz, Hansen-Verhältnis, Abschlussübergang sowie Cloud-Wiederherstellung prüfen.
