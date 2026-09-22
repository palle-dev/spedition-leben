# Disposition: Auftragsannahme und Fahrerauswahl – 22.09.2026

## Befund und Umsetzung
Untersucht wurde der aktuelle Sandbox-Code, kein aktueller produktiver Spielstand des Nutzers.
Baseline vor Produktionscode-Änderungen: 9bf5c39f4e1b66e96f8a08d5517229fbf60194a9.

1. Eine begrenzte Spitzenauswahl lukrativer, aber unmöglicher Angebote konnte alle ausführbaren Angebote verdrängen. Reproduktion: zwölf Angebote mit unerfüllbarer Frist plus ein ausführbares Angebot; vorher kein Vorschlag und keine Annahme. Jetzt folgt bei leerem Primärergebnis eine begrenzte Nachsuche nach Einzeltouren (höchstens viermal Kandidatenlimit zusätzlich, 48–96 Angebote). Keine größere Suche nach Auftragskombinationen.
2. Die Zusammenfassung scheinbar gleicher Fahrer ignorierte DACH-Wochenlenkzeitkonten. Ein frischer Fahrer konnte hinter einem Fahrer mit ausgeschöpfter Woche entfallen. Das effektive regulation-Konto gehört jetzt zur Vergleichssignatur.
3. Gefahrgut wurde erst bei Bestätigung vollständig geprüft. Ein ungeeigneter Fahrer konnte deshalb den besten Vorschlag belegen und die Bestätigung verhindern. Tourvorschläge prüfen jetzt Fahrerqualifikation, Fahrzeugausstattung und deren Gültigkeit bis zum Tourende; Fahrer mit Qualifikationen werden nicht mit unqualifizierten Kandidaten zusammengefasst.
4. Disponenten ohne Gefahrgutbefugnis konnten das teuerste Gefahrgutangebot auswählen und danach abbrechen. Neue Gefahrgutangebote werden für diese Disponenten bereits aus der Auswahl genommen; normale Angebote bleiben erreichbar. Gilt für volle Planungsrunde und Einzelfahrzeugplanung.
5. Stillstandsgründe unterscheiden Arbeitsmodus, deaktivierte Annahme und ausgeschöpfte Betreuungskapazität. Die Diagnose behauptet nicht mehr, alle verfügbaren Aufträge tatsächlich geprüft zu haben.

Produktionscode: tourEngine.ts und dispatcherProcessor.ts, jeweils identisch in src/lib/simulation und base44/shared.
Fristenpuffer, Befugnisse, Arbeitszeiten, Reservierungen, Kapazitäten und Gewinnprüfung bleiben wirksam.
Keine produktiven Daten geändert, keine Veröffentlichung ausgeführt.

## Nachweise
- 95 Tests in 13 relevanten Suites bestanden, inklusive DACH, Elektromobilität, Reservierungen, Tourabschluss, Client-/Shared-Parität und Zeitvorlauf-Konsistenz (tests.log).
- Projektweiter Typecheck ohne Fehler; Vite-Build erfolgreich (typecheck.log/build.log). Build meldet veraltete Browserslist-Daten.
- Neue Regressionen prüfen tatsächliche Annahme nach blockierter Vorauswahl, DACH-Fahrerauswahl, qualifizierte ADR-Fahrer, fehlende/ablaufende ADR-Qualifikation und normale Annahme ohne Disponenten-Gefahrgutbefugnis.
- Ein vor der DACH-Erweiterung geschriebener Entfernungstest verlangte die alte deutsche Formel auch für internationale Routen. Auf deutsche Stadtpaare eingegrenzt; DACH-Routentests bleiben separat bestehen. Keine Änderung der Entfernungsberechnung.

## Kontrollierter Laufzeitvergleich
Reproduktion: node bench/dispatch-intake.cjs [--baseline] --count=100 bzw. --count=250.
Node v20.20.2. Baseline lädt ausschließlich die zwei geänderten Produktionsmodule aus obigem Commit; restliche Engine identisch. Ein Aufwärmlauf, dann drei unabhängige Klone desselben Ausgangszustands. Exakte Werte und Ergebniszahlen stehen in before/after-100/250.json.

| Lkw | Tagesvorlauf vorher, Median | Nachher, Median | Lieferungen vorher/nachher | Fehlgeschlagene Aufträge vorher/nachher |
| --- | ---: | ---: | ---: | ---: |
| 100 | 632,8 ms | 656,8 ms | 216 / 216 | 0 / 0 |
| 250 | 4187,3 ms | 4001,5 ms | 533 / 533 | 0 / 0 |

Separater gezielter Auswahltest: zwölf zeitlich unmögliche Spitzenangebote und je ein ausführbares Angebot pro freiem Lkw.
| Lkw | Vorschläge vorher | Nachher | Suchzeit vorher, Median | Nachher, Median |
| --- | ---: | ---: | ---: | ---: |
| 100 | 0 | 100 | 11,6 ms | 13,5 ms |
| 250 | 0 | 250 | 64,1 ms | 40,4 ms |

Die Vorschläge im Auswahltest sind Planungen, keine bereits ausgeführten Lieferungen. Tatsächliche Annahme wird separat im Regressionstest geprüft. Der Tageslauf startet alle Fahrzeuge auf bestätigten Touren; der Auswahltest startet freie Fahrzeuge. Flotte, Angebote, Kapital und Disponentenbesetzung sind synthetisch. Während des Tageslaufs läuft die echte Engine einschließlich natürlicher Marktentwicklung.

## Grenzen
Kein Browser-Ende-zu-Ende-Test, kein Langzeitspielstand und keine allgemeine Laufzeitgarantie. Drei Wiederholungen reichen für einen groben Regressionsvergleich, nicht für eine behauptete Beschleunigung. Beide Tagesläufe zeigen dieselben Ergebniszahlen und ähnliche Laufzeiten.
Die Suche bleibt bewusst begrenzt (höchstens vier Fahrer pro Fahrzeug, begrenzte Auftragsauswahl). Sie garantiert keine vollständige globale Optimierung und keine volle Auslastung bei ungeeigneter Nachfrage, Personal-/Kapazitätsmangel oder deaktivierter Automatik.
Die konkreten Ursachen im aktuellen Nutzer-Spielstand sind ohne dessen Prüfung nicht abschließend zugeordnet.
