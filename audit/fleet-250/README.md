# Leistungstest: 250 LKW an zehn Standorten

## Ergebnis

Das Ziel von dauerhaft unter 20 Sekunden pro Tagesvorlauf ist unter dieser Last nicht erfüllt. Bereits der fünfte simulierte Tag benötigt 22,10 Sekunden reine Engine-Zeit. Der Median der drei unprofilierten Messtage beträgt 13,12 Sekunden. Keine Aussage über Browser-Gesamtdauer oder Langzeitstabilität.

| Tag | Messart | Engine | Lieferungen | LKW unterwegs am Tagesende | Aktiver Zustand |
|---|---|---:|---:|---:|---:|
| 1 | Anlauf | 3,93 s | 478 | 168 | 7,74 MB |
| 2 | Anlauf | 4,80 s | 406 | 170 | 12,26 MB |
| 3 | Messung | 8,12 s | 421 | 175 | 15,64 MB |
| 4 | Messung | 13,12 s | 430 | 170 | 18,36 MB |
| 5 | Messung | 22,10 s | 480 | 152 | 21,34 MB |
| 6 | zusätzliches CPU-Profil | 17,64 s | 421 | 169 | 24,10 MB |

250 Fahrzeuge und zehn Standorte wurden nach jedem vollständig ausgeführten Tagesvorlauf geprüft. Insgesamt 2.636 reale Engine-Lieferungen; der Betrieb steht nicht leer. „Unterwegs am Tagesende“ ist eine Momentaufnahme, kein Anteil der über den gesamten Tag genutzten Fahrzeuge. Aktive Aufträge wachsen bis Tag 6 auf 10.215, Journalbelege auf 10.775, Touren auf 2.813. Kompression/Archivübergabe kosten separat 0,06–0,13 Sekunden pro Tag; danach existieren 50 Archivblöcke. Sechs frühe Tage reichen nicht, um ein dauerhaft begrenztes Datenvolumen zu belegen.

## CPU-Befund

Gesampelte Eigenzeit an Tag 6 (keine inklusiven Aufrufzeiten):

| Funktion | Eigenzeit ungefähr |
|---|---:|
| computeOptions / Störungsoptionen | 2,11 s |
| hasPendingTour / Ressourcenbindung | 1,89 s |
| suggestTours / Tourensuche | 1,88 s |
| validateDisruptionResolution | 1,53 s |
| planningResources | 1,11 s |
| getDisruptionDetail | 1,07 s |

Die drei genannten Störungsfunktionen summieren sich auf ca. 4,70 Sekunden gesampelte Eigenzeit. Die Tourenprüfungen sind ein weiterer Kostenblock. Das Profil isoliert keine kausalen Anteile des Datenwachstums; dazu sind Vergleiche desselben Zustands nötig.

Die anschließende Codeprüfung zeigt einen konkreten Ansatzpunkt: `getPhoneProposals` lädt Störungsdetails und validiert danach jede verfügbare Option einzeln. Sowohl die Detailabfrage als auch jede Validierung berechnen über `computeOptions` den gesamten Optionssatz neu. Dabei werden Ressourcen und Touren wiederholt gesucht. Dies ist ein gezielter Kandidat für gemeinsam genutzte Berechnungen innerhalb einer ausschließlich lesenden Vorschlagsabfrage. Bei tatsächlicher Entscheidungsausführung muss weiterhin frisch gegen den dann aktuellen Zustand validiert werden.

## Nächster Umsetzungsschritt

1. Störungsoptionen je lesender Vorschlagsabfrage einmal berechnen und prüfen, statt den ganzen Optionssatz pro Option erneut zu berechnen.
2. Ressourcen-/Tourenprüfungen für diese Abfrage bündeln; keine über Spielereignisse hinweg gültigen ungeprüften Caches.
3. Gegen die unveränderte Version vergleichen: angebotene Optionen, Kosten, Dauer, Entscheidungen, Reservierungen, Zahlungen und Lieferungen müssen gleich bleiben.
4. Danach denselben 250-LKW-Test wiederholen; anschließend Spielalter und Historienvolumen getrennt untersuchen. Der alte 200-Tage-Lauf wurde hier weder gestartet noch verändert.

## Methode und Grenzen

Quellstand: `031e823dc8e394ab641817f6f03ffd5a6f0fa1dc`. Node 24.19.0. Separater synthetischer Testbetrieb mit 250 LKW, 350 Fahrern und 60 normalen Disponenten an zehn Standorten. Flotte, Personal und Kapital werden außerhalb der Messung bereitgestellt. Täglich Zustandsboden 85 für Fahrzeuge und Zufriedenheitsboden 75 für Personal. Täglich 500 synthetische Angebote zusätzlich zum natürlichen Markt. Fahrten, Ruhezeiten, Störungen und Lieferungen werden durch die echte Engine berechnet. Kein Beleg für die wirtschaftliche Erreichbarkeit dieser Flotte oder für typische Spielerlast.

Zwei Anlauftage, drei aufeinanderfolgende Messtage, danach ein zusätzlicher CPU-Sampling-Tag. Kein wiederholtes Messen desselben Zustands. Profiling kann Laufzeiten beeinflussen; Tag 6 ist deshalb nicht im Median/Maximum der Messtage enthalten. Reine Engine-Laufzeit; Archivverdichtung separat. Archivblöcke werden nur im Arbeitsspeicher abgelegt. Kein tatsächliches IndexedDB, kein Browser/Rendering, keine Cloud-Kommunikation. Keine Produktionsdaten geändert und keine Gameplay-Änderung veröffentlicht.

Reproduktion im Projekt: `node bench/fleet-250-profile.cjs --output /tmp/fleet-250-new --commit <tatsaechlicher-quellstand>`. Einen eigenen Ergebnisordner verwenden. Der Lauf erzeugt ausschließlich Messdaten; er ist unabhängig vom historischen Dauerlauf.
