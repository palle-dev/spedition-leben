# PV, Gewerbespeicher und elektrische Flotte

Stand: 22.09.2026. Implementierung im Base44-Entwicklungsstand; Veröffentlichung erfolgt durch den Eigentümer. Keine Produktionsspielstände verändert.

## Zugang im Spiel
- Filialen → Energie & E-Mobilität: Gesamtübersicht, Standort-/Zeitraumauswahl, Investitionen, Stromquellen, Tagesdiagramm, Energiebilanz und CSV.
- Filialdialog → Energie: derselbe Bereich für den gewählten Standort.
- Fuhrpark → Kaufen / Leasen: E-Regional-, E-Standard- und E-Fernverkehrs-Lkw, mit den bestehenden Aufbauten.
- Disposition: Ladephasen und Stopps erscheinen in der Vorschau und in laufenden Fahrten. Batteriestand steht in Fuhrpark und Energieübersicht.

## Spielregeln
Fiktive Fahrzeuge, Kapazitäten und Tarife, keine Herstellerspezifikationen oder reale Ertragsprognosen.
- Batterien 180/320/540 kWh, Basisverbrauch 65/95/125 kWh pro 100 km; Aufbauten beeinflussen den Verbrauch.
- PV in 50-kWp-Schritten, Gewerbespeicher in 100-kWh-/50-kW-Schritten.
- AC-Wallboxen 22 kW, Depot-DC-Lader 150 kW; Netzanschluss erweiterbar. Anschlüsse und Fahrzeugladeleistung begrenzen das gleichzeitige Laden.
- Ausbau wird nach Kauf sofort wirksam; Kosten werden als Betriebsanlage aktiviert und über die bestehende Anlagenbuchhaltung abgeschrieben.
- Freie elektrische Fahrzeuge in der Filialstadt laden automatisch bis voll; Reihenfolge nach Fahrzeug-ID. Solarstrom zuerst, dann ausschließlich mit Solarstrom gefüllter Speicher, zuletzt Netz. PV-Überschüsse fließen in Speicher und Einspeisung.
- Netzstrom 0,30 €/kWh; öffentliche Ladung 0,65 €/kWh; Einspeisung 0,08 €/kWh; Ladeeffizienz 92 %, Speicherwirkungsgrad je Richtung 95 %.
- Synthetische Stunden-Sonnenkurve mit 365-Tage-Jahreszeit, Standortfaktor und deterministischem Wetter. Kein Gebäudestromverbrauch.
- Öffentliche Lkw-Ladehubs in allen 30 Spielstädten, maximal 300 kW und durch Fahrzeug begrenzt. 5 Minuten Anschlusszeit. Keine realen Stationsdaten, dynamischen Warteschlangen oder Ladekurven.
- Planung hält 10 % Batteriereserve und lädt öffentlich bis 90 %. Erforderliche Umwege, Ladezeit, Lenkpausen und Ruhezeiten zählen zur Tour und ihren Lieferfristen. Laden zählt konservativ als Arbeitszeit.
- Depotladung während zukünftiger Wartezeiten wird in einer langfristigen Vorschau nicht vorweggenommen. Beim tatsächlichen Start wird mit dem aktuellen Akku neu geplant; der Ladestrom unterwegs kann dadurch günstiger werden.
- Unterwegs-Strom wird für den geplanten Einsatz bei Fahrtstart bezahlt. Mengen und Verbrauch werden bei Abschluss der jeweiligen Phase erfasst. Depotnetz und Einspeisung werden um Mitternacht abgerechnet. Daher sind zeitweilig Vorauszahlung und Verbrauchsauswertung unterschiedlich.
- Eine bei Kauf/Leasing volle Batterie gehört zum Fahrzeugpreis; sie zählt nicht als selbst erzeugter oder nachgeladener Strom.

## Daten und Architektur
Gemeinsame Katalogdaten für Oberfläche und Engine; Simulation identisch in src/lib/simulation und base44/shared.
energyEngine integriert Intervalle bis Stunde, vollem Akku oder vollem/leeren Speicher. Keine neue Minutenschleife. Bestehende Zeit- und Tourenereignisse nutzen dieselbe Energie-/Routenberechnung.
buildDeployment und buildEmptyDeployment sind Grundlage manueller und automatischer Disposition. Tourenketten führen den verbleibenden Akku fort. Beim Start nicht mehr mögliche Ladewege pausieren die Tour, ohne den Vorlauf abzubrechen.
Bestehende Spielstände behalten ihre Fahrzeuge unverändert. Neue Energiedaten entstehen ohne rückwirkende Produktion oder geschenkte Anlagen. Speicherung läuft über den bestehenden vollständigen Spielzustand, ohne neue Base44-Entity.
Pro Standort bleiben 90 Tageszeilen im aktiven Zustand. Ältere Originalzeilen gehen als energyDays verlustfrei in die bestehende Archiv-Outbox. Lebenszeit-Gesamtzähler und Fahrzeug-Energiezähler bleiben erhalten; ältere Zeilen sind im Historienarchiv zugänglich. Diagramm/CSV zeigen höchstens die aktiven 90 Tage.

## Prüfung
Neue Tests:
- tests/energy-mobility.test.ts: Migration, Upgrade-Buchung, Strom-/Verlustbilanz, Ladeleistung und Anschlusswechsel, Standort-/Einsatzfilter, Schrittweiten, JSON-Rundlauf, Archivierung, Langstrecken, Reichweitensperre, Phasenteilung, Kauf und Leasing, kurze Zeitvorläufe.
- tests/energy-integration.test.ts: tatsächliche Lieferung bis Abschluss mit Zahlung, fortgeführter Akku in Ketten, Ablehnung verspäteter Neuaufträge wegen Ladezeit, sichere Pause bei unerreichbarem Rückweg, serverseitiges UI-Rendering alter Spielstände, 250-Lkw-/10-Standort-Energietest und vollständige Simulation in Tages-/Stunden-/Viertelstundenschritten.

Zusätzlich vorhandene Vorlauf-, Touren-, Dispositions- und Finanzierungstests. Vergleich der acht geänderten/neuen Simulationsmodule zwischen Client und Shared. Produktions-Build und gezielter ESLint-Lauf.

Isolierter Energiesystem-Test: 250 stehende synthetische E-Lkw, zehn Filialen mit PV/Speicher/Ladepunkten, 1.440 Minuten: rund 8 ms in dieser Sandbox. Das ist KEIN Benchmark des gesamten Spiels, der Disposition mit 250 fahrenden Lkw oder der Browser-Gesamtdauer. Keine neue Aussage über die frühere 20-Sekunden-Zielvorgabe.
UI wurde per React-Rendering geprüft; keine vollständige interaktive Browser-/Produktionsabnahme in diesem Arbeitsschritt.
