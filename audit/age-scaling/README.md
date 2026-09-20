# Spielalter-Test: 250 LKW an zehn Standorten

Quellstand: `b8680ddad139c23ee1708d468110bf2040c59e39`. Gemessen am 20.09.2026, Node v24.19.0. Alle 92 relevanten Simulations-/Archivdateien wurden per SHA-256 mit Base44 abgeglichen. Keine Abweichung.

## Ergebnis

20 aufeinanderfolgende vollständige Tagesvorläufe, zusätzlich ein CPU-Profil an Tag 21. Alle Tage mit 250 LKW, zehn Standorten und echten Lieferungen. Insgesamt 8,981 Lieferungen an Tag 1–20. Median Tag 3–20: 15.85 s; Maximum: 21.87 s.

| Tage | Median Engine | Maximum Engine |
|---|---:|---:|
| 1–5 | 5.64 s | 11.44 s |
| 6–10 | 13.30 s | 13.49 s |
| 11–15 | 17.68 s | 21.56 s |
| 16–20 | 20.72 s | 21.87 s |

Tage 1–2 sind Anlauftage; sie sind nur in der ersten Verlaufsgruppe enthalten. Tag 21 mit Profiling ist aus allen obigen Zeitkennzahlen ausgeschlossen.

| Schwelle | Erster unprofilierter Tag |
|---|---:|
| >5 s | 3 |
| >10 s | 5 |
| >20 s | 12 |
| >30 s | nicht erreicht |
| >60 s | nicht erreicht |
| >120 s | nicht erreicht |
| >180 s | nicht erreicht |
| >300 s | nicht erreicht |

## Datenwachstum

| Bereich | Tag 1 | Tag 8 | Tag 20 |
|---|---:|---:|---:|
| orders | 3.49 MB | 9.88 MB | 16.47 MB |
| accounting | 1.57 MB | 8.32 MB | 10.26 MB |
| tours | 1.09 MB | 5.01 MB | 5.20 MB |
| trips | 0.56 MB | 2.83 MB | 2.92 MB |
| mail | 0.02 MB | 0.24 MB | 0.55 MB |
| historyArchive | 0.00 MB | 0.01 MB | 0.04 MB |
| Gesamter aktiver Zustand | 7.74 MB | 27.63 MB | 37.83 MB |

## Methode und Grenzen

Isolated synthetic 250 trucks / 10 branches, 350 drivers, 60 ordinary dispatchers, capital and daily condition/morale floors. 500 synthetic offers/day plus natural market; real engine simulation and deliveries. Two warmup days, remaining consecutive days measured, one additional sampled day. Per-component JSON sizes measured outside engine time. Compaction and simulated archive staging outside engine time; no browser, actual IndexedDB, cloud, production saves or historical endurance process. Not a long-game proof; fleet size and game age need separate tests.

Alle ersten sechs vollständigen Zustandshashes stimmen mit dem vorherigen Reservierungs-Benchmark überein. Danach gab es keinen Vergleichslauf einer zweiten Implementierung: Es wurde keine Engine geändert. Zeitwerte sind ein einzelner kontrollierter Verlauf, kein statistischer Browser-Leistungsnachweis. Aktive MB sind UTF-8-JSON-Größen, kein RAM-Verbrauch. Archivblöcke werden im Speicher gehalten, nicht in echter IndexedDB oder Cloud geschrieben. Kompression wird separat gemessen. Synthetische Angebote beeinflussen Last und Liefermix. Die Messung belegt weder tausende Tage noch Flotten über 250 LKW.

Reproduktion: `node bench/age-scaling-replay.cjs --days 20 --output /tmp/new-age-run --commit <stand>`. Das Ausgabeverzeichnis muss neu sein. Der alte 200-Tage-Prozess und Produktionsspielstände bleiben unberührt.

## CPU-Profil und nächster Eingriff

Am zusätzlichen Profiling-Tag 21 (26,23 s, nicht Teil der regulären Zeitstatistik) entfallen allein rund 3,47 s Sample-Selbstzeit auf die lineare Auftragssuche in der Ersatzfahrzeugsuche. Weitere große Anteile: computePlanableFleetN rund 3,14 s, computeOptions rund 3,03 s und planningResources rund 1,38 s. Die Zeilennummern im Profil beziehen sich auf das transpilierten JavaScript. Sample-Zeiten sind keine exakten isolierten Funktionsmessungen.

Die gezielte Änderung nutzt den vorhandenen, während eines Vorlaufs gepflegten Auftragsindex bei vier Suchstellen im Störungsmanagement. Spielregeln, Kandidatenzahl, Dispositionsintervall und Historienaufbewahrung bleiben gleich. Außerhalb eines Vorlaufs fällt der Helfer auf die direkte Suche zurück. Drei neue Tests prüfen Gleichheit der Störungsvorschläge mit/ohne Index und Änderungen durch Anhängen, Feldänderung und Austausch der Auftragsliste.

Der Replayer `bench/age-lookup-replay.cjs` verarbeitet einen weiteren Tag aus derselben synthetischen Engine-Fixture. Diese erzeugt der Alterstest als `engine-fixture.json.gz`. Sie enthält externe Archivverweise und ist ausdrücklich kein importierbarer Spielstand. Der Replayer liest keine Archive und speichert keine Produktionsdaten. An diesem zusätzlichen Tag werden keine synthetischen Angebote ergänzt; der natürliche Markt bleibt aktiv. Daher ist dieser Vergleich separat von der 20-Tage-Reihe zu interpretieren.

Ergebnis des zusätzlichen Vergleichs: 26.30 → 18.57 s (29.4 % weniger in diesem einzelnen Lauf). Beide Varianten: 292 Lieferungen und derselbe vollständige SHA-256-Zustand `967e150bb822819448760f4f2604efdbf563475b8005fdb6e9b8d28c657823c1`. Kein allgemeiner Nachweis für dauerhaft unter 20 Sekunden. 649 Tests bestanden, ein bestehender Test übersprungen.
