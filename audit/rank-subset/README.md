# Adaptive Auswahl kleiner Auftragsteilmengen

Ausgangsstand da185cb891ff07be66ff2507252845be7f5f2343. Ein CPU-Profil eines weiteren Tages aus dem synthetischen 250-LKW-/10-Standorte-Zustand zeigte die Rangfolgenauswahl als relevanten Verbraucher. Profilierter Lauf: 18,619 s. Dieser Wert wird nicht mit unprofilierten Läufen als Beschleunigungsnachweis verrechnet.

## Änderung

createPlanningOrderRanking behält die vollständige stabile Rangfolge je Stadt bei. Kleine geeignete Teilmengen werden anhand zwischengespeicherter Rangpositionen sortiert, wenn n*log2(n) kleiner als die Poolgröße ist. Größere Teilmengen behalten den bisherigen Scan. Positionsindex ist nur innerhalb einer read-only Planung gültig. Nicht-endliche Vergleichswerte behalten den bisherigen Fallback. Bei doppelten Objekten im Pool bleibt ebenfalls der Scan erhalten. Keine Kandidatenbegrenzung, Prioritäts- oder Simulationsregel geändert. src und base44/shared identisch.

## Messung

Gezieltes synthetisches Szenario: 10.000 Aufträge, 200 kleine Teilmengen spät in der Rangfolge. Ein Aufwärmpaar, fünf wechselnd angeordnete Messpaare einschließlich Aufbau der Rangfolge und Indexe. Median 34,42 auf 3,22 ms, identische Ergebnisse. Dieser absichtlich günstige Teilmengenfall ist nicht repräsentativ für alle Planungen.

Vollständige Engine-Tage aus identischem internem Tag-21-Fixture, drei Läufe pro finalem Stand:
- Vorher: 18,020 / 18,447 / 17,652 s; Median 18,020 s.
- Danach: 18,803 / 18,110 / 17,294 s; Median 18,110 s.

Damit keine nachgewiesene Beschleunigung der gesamten Tagesberechnung; Median etwa 0,5 Prozent höher bei überlappenden Messbereichen. Die Änderung verbessert gezielt dünne Teilmengen, nicht pauschal jeden Tageslauf. Alle sechs Ergebnisse vollständig hashgleich: 967e150bb822819448760f4f2604efdbf563475b8005fdb6e9b8d28c657823c1, jeweils 292 Lieferungen, 250 LKW, zehn Standorte, gameTime 32160. Werte siehe days.json und sparse.json. Separater Vorversuch nicht in den finalen Messpaaren.

Kontrollierter Engine-Test unter Node v24.19.0, keine Browser-Gesamtdauer. Fixture synthetisch aufgebaut, zusätzlicher Tag mit natürlichem Markt. Kein Dateizugriff, Archivlesen, Speichern, Kompaktieren oder Cloud im gemessenen Tagesabschnitt. Kein Nachweis für tausende Tage oder eine allgemeine 20-Sekunden-Grenze. Originaldaten und Produktionsspielstände unverändert.

Reproduktion: bench/age-lookup-replay.cjs mit identischem internem Fixture und jeweiligem --sourceRoot; bench/rank-subset-replay.cjs --baseline /path/to/before --output /tmp/new-run. Das interne Engine-Fixture ist keine portable Sicherung.

Zusätzliche Tests vergleichen dünne und dichte Teilmengen, mehrere Städte, stabile Gleichstände und Quellzustands-Isolation gegen die ursprüngliche Rangfunktion. Vollsuite, Lint und Base44-Build vor Übergabe. Keine Veröffentlichung durch den Agenten.
