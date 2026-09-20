# Gemeinsamer Auftragspool je Dispositionssuche — 2026-09-20

Baseline: c879099a0f662ffd88e3ee3f787d6a5f1039004d.

CPU-Profil auf privater Exportkopie: suggestTours ist mit ~653 ms gesampelter
Eigenzeit größter Einzelblock eines ~4,94-s-Tagesvorlaufs. Ein Teil der Arbeit
filterte dieselben Fristen, Reservierungen, laufenden Touraufträge und optionalen
Auftragsbeschränkungen erneut pro Fahrzeug.

suggestTours bildet jetzt je rein lesender Suche einen gemeinsamen Auftragspool.
Angenommene Aufträge werden einmal stabil nach Frist sortiert. Pro Fahrzeug
bleiben Kapazität, Aufbautyp und bereits verwendete Auftrags-IDs individuell.
Die Anschlussauftrags-Map entsteht einmal je Fahrzeug statt je Fahrer.
Keine Änderung von Auftragslimits, Fahrerlimits, Auswahlbewertung, Dispositions-
takten oder Spielregeln. Keine über die Suchrunde hinaus gecachten Daten.
src/lib/simulation und base44/shared sind identisch.

## Nachweis
596 Tests erfolgreich, ein vorhandener Test übersprungen.
Build und ESLint erfolgreich.
bench/planning-pool-replay.cjs --save /private/export.json
  --baseline /baseline/src/lib/simulation --output /tmp/metrics.json

97 aktive LKW, sechs Standorte, drei vollständige Tagesvorläufe.
Alle operativen Zustandsfelder einschließlich Aufträgen, Touren, Mitarbeitern,
Historien-Outbox und Historiensequenz vor/nach Änderung identisch.
Finanzberichte für historische Zeitpunkte und sämtliche 22.957 ursprünglichen
Journalbelege ebenfalls geprüft. Archivdeskriptoren/Projektionen werden separat
über Finanzberichte/Originalbelege geprüft statt als operative Daten verglichen.

Einzelmessungen reine Engine vorher/nachher:
- 5.397 → 4.721 ms
- 3.699 → 3.031 ms
- 3.232 → 3.009 ms
Tägliche Kompression danach zusätzlich ~120–208 ms.

## Grenzen
Einzelmessungen, kein statistisch abgesicherter Speedup und keine Browser-,
IndexedDB-, Rendering- oder Netzwerkgesamtdauer. Kein <20-Sekunden-/250-LKW-/
Tausende-Tage-Nachweis. CPU-Samples in profile-before.json enthalten Profiling-
Overhead und transpilierten Code; sie dienen zur Engpasssuche.
Keine Produktionsspielstände verändert. Frontend manuell veröffentlichen.
