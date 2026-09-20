# Planbare Flotte: lokale Verfügbarkeiten

## Änderung

`computePlanableFleetN` gruppiert Fahrer nach aktuellem Standort unter Beibehaltung ihrer ursprünglichen Reihenfolge. Die früheste Verfügbarkeit wird einmal je betrachtetem Fahrzeug und bedarfsweise einmal je Fahrer ermittelt. Die Paarverfügbarkeit entspricht dem Maximum beider Werte, wie bereits in der Machbarkeitsprüfung des Marktes. Keine dauerhafte Zwischenspeicherung: Jede Berechnung liest den aktuellen Zustand frisch. Greedy-Zuordnung, Verfügbarkeitsgrenze von 72 Stunden, Fahrzeugreihenfolge (freie zuerst), Gleichstandsregel und Ausschluss bereits verwendeter Fahrer-IDs bleiben erhalten. Auch der ursprüngliche strikte Standortvergleich bleibt bestehen.

Es werden weder Marktregeln, Suchumfang noch Historienaufbewahrung geändert. Src- und Shared-Kopie identisch geändert. Kein Produktionsspielstand verändert und kein Frontend veröffentlicht.

## Prüfung

652 Tests bestanden, ein bestehender Test übersprungen. Drei neue Tests vergleichen gegen die ursprüngliche vollständige Paarprüfung: 100 deterministische gemischte Zustände, unveränderter Zustand, neue Ergebnisse nach Änderungen an Fahrten/Ruhe/Wartung/Standorten, inklusive 72-Stunden-Grenze sowie leere oder fehlende Standorte.

## Laufzeitvergleich

Ausgangscommit: `87c6f165094f3f88c165a3c8de48ed7aea82f63f`, Node v24.19.0. Derselbe synthetische Zustand nach 21 Tagen, 250 LKW und zehn Standorte; ein weiterer vollständiger Tagesvorlauf, natürlicher Markt aktiv. Auf diesem zusätzlichen Tag keine ergänzten synthetischen Angebote. Vorher und nachher seriell ausgeführt; Tests und Lint außerhalb der Messung.

| Variante | Engine-Zeit | Lieferungen |
|---|---:|---:|
| Vorher | 19.279 s | 292 |
| Nachher | 17.761 s | 292 |

Rund 7.9 % weniger in diesem einzelnen Vergleich. Vollständiger Zustands-SHA-256 beider Varianten: `967e150bb822819448760f4f2604efdbf563475b8005fdb6e9b8d28c657823c1`. Eingabe-Prüfsumme ebenfalls identisch. Keine statistische Dauerzusage; Engine-Zeit ohne Browserdarstellung, Speicherung, Kompression oder Cloud. Kein Nachweis für tausende Tage oder dauerhaft weniger als 20 Sekunden. Das Datenwachstum bleibt ein gesonderter Arbeitsbereich.

## Reproduktion

`bench/age-scaling-replay.cjs --days 20` erzeugt den synthetischen Testzustand als `engine-fixture.json.gz`. Diese Datei enthält externe Archivverweise und ist kein portabler Spielstand. Danach `node bench/age-lookup-replay.cjs --state <fixture> --sourceRoot <pristine-root> --commit <stand> --output <neuer-ordner>` für die Ausgangsversion; ohne `--sourceRoot` für die Änderung. Der Replayer benötigt keine historischen Archivinhalte und verändert keine Produktionsdaten.
