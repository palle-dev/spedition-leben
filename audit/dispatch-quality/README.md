# Verbindliche Disposition – Prüfung am Export „palle“

## Problem und nachgewiesene Ursachen

Der ursprüngliche Export hat 97 aktive LKW, sechs Standorte und Spielminute 176436. Im Startzustand konkurrieren geplante Einsätze bei zehn Fahrzeugen und 14 Fahrern mehrfach um Ressourcen. Hunderte ältere Touren wurden nach nicht erfolgtem Start oder wegen falscher Standorte abgebrochen.

Die bisherige Performanceoptimierung hat diese bestehenden Entscheidungen bewusst ergebnisgleich beschleunigt. Diese Änderung korrigiert nun die Entscheidungen und ihre Ausführung:

1. Noch nicht gestartete Folgeeinsätze reservieren Fahrzeug und Fahrer durchgehend, einschließlich vorgesehener Warte-/Ruhezeit und Rückfahrt. Andere Touren, manuelle Einzel-/Leerfahrten und die Ersatzressourcensuche dürfen diese Ressourcen nicht abziehen. Die automatische Weiterplanung nach Abschluss einer Fahrt kann keine offene Rückladung mehr verdrängen.
2. Der zukünftige Standort stammt ausschließlich aus der tatsächlich laufenden Fahrt. Ein geplanter, noch nicht ausgeführter Einsatz ist kein bereits erreichter Standort.
3. Tatsächlicher Start und Vorschau verwenden dieselben nachgewiesenen Ruhezähler. Bei alten freien Fahrern ohne Zeitstempel wird der Beginn der beobachteten Ruhe bei Bestätigung festgehalten.
4. Bekannte Urlaube und Trainingsblöcke einschließlich anschließender Ruhe werden für die gesamte geplante Fahrt geprüft. Kurskonflikte lesen die Fahrerzuordnung auf der Tour, nicht ein nicht vorhandenes Deployment-Feld. Automatische Weiterbildung berücksichtigt bestehende Reservierungen und Konflikte.
5. Der Assistent nimmt neue Aufträge nur zusammen mit einer ausführbaren, bestätigten Tour und Pünktlichkeitspuffer an. Marge, Liquiditätsreserve, Ausgabenbefugnis, Filialzuordnung und Stundenlimit gelten weiter. Die bisherige pauschale 30%-Kostenschätzung begründet keine Zusage mehr.
6. Reservierte Fahrzeuge erhalten einen entsprechenden Stillstandsgrund; die Beschreibung der automatischen Auftragsannahme erklärt die neue Verbindlichkeit.

## Vergleich über fünf vollständige Spieltage

Beide Varianten starten mit einer frischen Kopie desselben unveränderten Originalexports. Keine künstliche Unterstützung von Kapital, Personal, Fahrzeugzustand oder Zufriedenheit. Die aktuelle Base44-E-Mail-Logik ist in beiden Varianten identisch enthalten. Vorlauf endet jeweils bei Spielminute 183636.

### Nur innerhalb des Tests neu angenommene Aufträge

| Ergebnis | Bisheriger Code | Korrigierter Code |
|---|---:|---:|
| Neu angenommen | 561 | 457 |
| Pünktlich geliefert | 227 | 353 |
| Verspätet geliefert | 126 | 0 |
| Gescheitert | 86 | 4 |
| Noch offen | 122 | 100 |

Beide Varianten liefern 353 der neu angenommenen Aufträge aus. Die Korrektur reduziert unhaltbare zusätzliche Zusagen. Offene Aufträge sind ausdrücklich nicht als Erfolg gezählt. Unter den nach fünf Tagen bereits fälligen neuen Zusagen der korrigierten Variante: 321 pünktlich geliefert, vier gescheitert, keine mehr offen. Details und Vergleichskohorte siehe JSON.

### Tagesverlauf einschließlich bereits übernommener Altaufträge

| Testtag | Vorher: pünktlich / spät / gescheitert | Nachher: pünktlich / spät / gescheitert | Vorher Engine-s | Nachher Engine-s |
|---|---|---|---:|---:|
| 1 | 49 / 36 / 30 | 59 / 37 / 28 | 18.42 | 11.44 |
| 2 | 59 / 33 / 21 | 86 / 4 / 7 | 17.89 | 8.23 |
| 3 | 67 / 35 / 26 | 94 / 1 / 3 | 16.74 | 7.55 |
| 4 | 61 / 28 / 34 | 88 / 0 / 1 | 20.99 | 8.24 |
| 5 | 45 / 41 / 20 | 94 / 0 / 1 | 30.74 | 10.68 |

Altlasten bleiben am ersten Tag sichtbar. Gescheiterte Aufträge und Kundenvertrauen werden nicht zurückgesetzt. Abgelaufene, nie angenommene Marktangebote werden separat erfasst und sind keine gescheiterten Lieferzusagen.

## Prüfungen und Grenzen

491 Tests bestanden, ein optionaler Test übersprungen; Build und vorhandener Lint-Lauf erfolgreich. Neue Regressionstests sichern getrennte Fahrzeug-/Fahrerbindung, überfällige Reservierungen, manuelle Umgehungswege, Rückladungen/Rückfahrten, identische Ruheberechnung, alte fehlende Zeitstempel, zukünftige Abwesenheiten, Kurskonflikte und verbindliche Assistentenannahme ab. Browser- und Servermodule identisch.

Engine-Zeit nachher: 7.55–11.44 Sekunden pro Tag. Node v24.19.0, kein Browser-Gesamttest. Ladezeit, Worker-Transport, Rendering und Speicherung sind nicht enthalten. Ein natürlicher Fünf-Tage-Lauf je Variante ist kein statistischer Nachweis für alle Spielstände. Andere Entscheidungen verändern die spätere Zufallsfolge; identische Ergebniszustände werden bei dieser Korrektur ausdrücklich nicht erwartet.

Die Reservierung ist bewusst verbindlich bis zum Folgeeinsatz; kurzfristige Zusatzaufträge in einer vermeintlichen Lücke werden nicht auf Kosten der zugesagten Route eingeschoben. Abwesenheiten/Störungen, bereits verlorene Ladefenster und Altfehler können weiterhin reale Ausfälle verursachen. Kein pauschales Erfolgsversprechen und keine rückwirkende Heilung alter Lieferungen.

## Reproduzieren

`node bench/replay-quality.cjs --save /privater/pfad/export.json --days 5 --output /tmp/quality.json`

Für den Vergleich `--engine /pfad/zur/alten/simulation` ergänzen. Originalexport und vollständige Spielzustände sind nicht Teil des Repositories. Der separate, eingefrorene 200-Tage-Test bleibt unverändert. Veröffentlichung über das Base44-Dashboard erforderlich.
