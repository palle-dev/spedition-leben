# Tagesvorlauf-Regression behoben – 22.09.2026

## Ergebnis
Die vorherige Dispo-Erweiterung hatte einen echten blinden Fleck: Die Nachsuche nach weiteren Angeboten vervielfachte vollständige Planungen, wenn Fahrer aufgrund ihrer Wochenlenkzeit überhaupt keinen Auftrag vor der Frist fahren konnten. Der bisherige Lasttest mit passenden Angeboten bildete das nicht ab.

Der Stunden-Profillauf mit 100 Lkw dauerte vor der Dispo-Erweiterung 758,7 ms, danach 12.862,5 ms. Messdateien: blocked-before-intake.json / blocked-before.json. Profilzeiten dienen der Diagnose, nicht als uninstrumentierte Tagesbenchmarks.

## Finale Messungen
Uninstrumentierte Node-Engine, Version v20.20.2; keine parallel gestarteten Lasttests. Vorher-Referenz für diese Korrektur: Commit 0ba625f985f2171b1c1b7b23e83b19410ea985eb. Es werden nur tourEngine.ts und dispatcherProcessor.ts aus dem Vergleichscommit geladen; restliche Engine unverändert.

| Test | Vor Korrektur | Final | Nachweis |
| --- | ---: | ---: | --- |
| 100 Lkw, blockierte Wochenlenkzeit, +1 Tag | 104,754 s | 1,370 s | Vollständiger Ergebniszustand SHA-256 identisch |
| 250 Lkw, blockierte Wochenlenkzeit, +1 Std | 44,939 s | 0,607 s | Vollständiger Ergebniszustand SHA-256 identisch |
| 250 Lkw, blockierte Wochenlenkzeit, +1 Tag | Kein vollständiger Originallauf | Median 9,571 s; Maximum 10,013 s | Drei finale Wiederholungen: 10,013 / 6,629 / 9,571 s; gleiche Hashes |
| 250 aktiv eingesetzte Lkw, +1 Tag | Vorheriger Dispo-Audit: Median 4,001 s | Median 4,252 s; Maximum 4,342 s | Je 533 Lieferungen, 0 fehlgeschlagene Aufträge, 786 Touren |

Die aktive Flotte blieb damit ungefähr auf ihrem vorherigen Laufzeitniveau; hierfür wird keine Beschleunigung behauptet. Der getrennte Auswahltest findet weiterhin 250 ausführbare Tourvorschläge hinter zwölf unmöglichen Spitzenangeboten. Die Dispo-Qualitätskorrektur wurde nicht zurückgenommen.

Der separate synthetische Tag-60-Spielstand (75 Fahrzeuge, 105 Fahrer, 18 Mitarbeiter, 5651 aktive/noch vorgehaltene Aufträge, 957 Trips, 1063 Touren) liefert ebenfalls denselben vollständigen Ergebniszustand. Originalexporte/Produktionsdaten wurden nicht verändert.

## Änderungen
1. Optimistische Ankunftsuntergrenze prüft, ob schon die Mindestdauer oder eine ausgeschöpfte Wochen-/Doppelwochenlenkzeit die Lieferfrist einschließlich vorhandener Kulanz unerreichbar macht. Ladefenster werden ebenfalls geprüft. Zusätzliche Pausen, Fahrverbote, Zoll und Ladezeit werden im Mindestwert bewusst nicht erzwungen: Die Prüfung darf Unmögliches durchlassen, aber nichts Machbares verwerfen. Die vollständige Prüfung bleibt zuständig.
2. Für elektrische Laderouten wird keine direkte Streckenlänge als garantierte Mindestdauer verwendet. Zwischenorte und gerundete Strecken könnten sonst die Untergrenze verfälschen. Zeit zum Laden/Entladen und Wochenlimits bleiben sichere Grenzen.
3. Fahrzeug-/Kabotagekopien und Batterievorschau erst nach der ersten Machbarkeitsprüfung. Unmögliche Erstaufträge werden innerhalb derselben reinen Suche auch nicht erneut als Beginn jeder Auftragskombination berechnet.
4. Ausschließlich leere Suchergebnisse werden innerhalb EINER synchronen Mitarbeiter-Planungsrunde wiederverwendet, mit vollständigen Suchoptionen als Schlüssel. Unterschiedliche Fahrzeugpools, Gefahrgutbefugnisse, Puffer, Horizonte, Modi und Kapazitäten bleiben getrennt. Verwerfen vor jeder nichtleeren Suche/Bestätigung, vor Überfälligkeitsmutationen, anderen Mitarbeitermodi und Buchhalter-/Reinigungstätigkeiten. Keine Wiederverwendung über Ereignisse, Befehle oder Spielstände hinweg.
5. Die reine Stillstandsbeschriftung zählte vorher pro Fahrzeug erneut sämtliche verfügbaren Aufträge. Nach allen Bestätigungen wird diese unveränderte Zahl jetzt höchstens einmal je Disponent ermittelt. Das Profil zeigte rund 19,5 Sekunden reine Sample-Zeit allein in diesem Filter.

## Entwicklungsstufen und Rohdaten
- day100-before.json: ursprüngliche Regression, 104,754 s; day100-after.json: frühe Untergrenze/lazy Fahrzeugkopie, 9,309 s; day100-final.json: fertig.
- day250-after.json: Zwischenstand mit Untergrenze/lazy Kopie, noch 185,674 s. Das ist NICHT die ursprüngliche Vollversion! Vollständiger Hash identisch zu allen finalen Tagesläufen.
- day250-before-diagnostics-fix.json: nach Suchwiederverwendung, noch 28,694 s. blocked250-profile.json: instrumentierter Zwischenstand, der den wiederholten Diagnosefilter nachweist.
- day250-final*.json: drei vollständige Tagesläufe nach allen Korrekturen.
- hour250-before.json / hour250-final.json: sauberer Vergleich gegen die ursprüngliche Regression über eine Stunde.
- active250-final.json: ein Aufwärmlauf und drei Wiederholungen aktiver Flotte auf unabhängigen Zustandskopien. Das ältere audit/dispatch-intake/after-250.json wurde unverändert erhalten.
- summary.json: maschinell geprüfte Hashvergleiche und Messzusammenfassung.

## Prüfung und Wiederholung
149 Tests in 18 Suites bestanden. Projektweiter Typecheck und Produktionsbuild erfolgreich. Build-Hinweis zu alten Browserslist-Daten besteht unverändert. Tests umfassen Frist-/Ladefenstergrenzen, Wochenwechsel, alte Inlandszusagen, ADR, E-Mobilität, Reservierungen, Client-/Shared-Parität und Vorlaufkonsistenz. Der neue Optimismus-Test vergleicht 80 Kombinationen aus Route, Uhrzeit, Abholfenster und Wochenkonto gegen vollständige Phasenplanung. Cachetests prüfen identische Zustände zur Einzelbearbeitung, neue Angebote, unterschiedliche Profile und Invalidierung bei erfolgreicher Spezialistenplanung.

Beispiele:
```
node bench/day-performance.cjs --fleet 250 --dach --blocked --no-profile --output /tmp/day250.json
node bench/day-performance.cjs --baseline 0ba625f985f2171b1c1b7b23e83b19410ea985eb --fleet 100 --dach --blocked --no-profile --output /tmp/old100.json
node bench/dispatch-intake.cjs --count=250 --output /tmp/active250.json
```
Ohne --no-profile wird ein CPU-Sampleprofil mitgeschrieben. Frische Prozesse und Kopien für jeden Tagesvergleich, fixierte Date.now-Zeit, Messung über performance.now. Vorbereitungen, Transpilierung, Eingangsarchivierung und Hashberechnung sind außerhalb der Engine-Zeit.

## Grenzen und Veröffentlichung
Blockierte Flotten sind absichtlich ein Extremfall ohne Lieferungen: Wochenbudget ausgeschöpft, enge Angebote. Sie sind getrennt von der aktiven Lieferflotte zu bewerten. Flotte, Personal, Startkapital und Angebote sind synthetisch; während des Vorlaufs läuft die echte Engine einschließlich natürlichem Markt. Alle Vorläufe erreichen die vollständige Zielminute.
Kein aktueller Nutzer-Spielstand und keine Browser-Gesamtdauer gemessen. Die Ergebnisse sind keine allgemeine Unter-20-Sekunden-Garantie für jedes Gerät, jede Unternehmensgröße oder jeden Spielstand. Browser-Transport, Archivspeicherung und Rendering sind nicht enthalten.
Änderungen liegen identisch in src/lib/simulation und base44/shared. Keine Daten gelöscht, keine Produktionsspielstände bearbeitet, keine automatische Veröffentlichung. Veröffentlichung erfolgt über Base44.
