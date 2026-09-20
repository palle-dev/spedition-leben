# Finanzhistorie ohne vollständige Kopie je Archivierung

Ausgangscommit: `698e5c70db74adb6513f11d190ba9fba60d02190`.

## Befund und Änderung

`projectJournal` kopierte bisher die gesamte bereits aufgebaute historische Finanzprojektion per structuredClone, bevor wenige neue Buchungen addiert wurden. Dieser Aufwand wuchs mit dem Spielalter, obwohl die allermeisten Tage unverändert blieben.

Jetzt wird die Tageszuordnung flach kopiert, und nur erstmals im aktuellen Stapel berührte Tage werden tief kopiert. Tages- und Minutensummen werden weiterhin identisch fortgeschrieben. Eine rückdatierte Buchung kopiert ihren historischen Tag ebenfalls vor der Änderung. Unberührte Tage werden als unveränderliche Objekte geteilt. Es gibt keinen neuen Cache, kein geändertes Speicherformat und keine Migration. Die Simulation schreibt Projektionen ausschließlich über diese Funktion; Leser behandeln die Daten unveränderlich.

Offene Buchhaltungsaufgaben bleiben aktiv: Sie sind unerledigte Vorgänge und dürfen nicht ohne Ersatz aus dem Arbeitsbestand entfernt werden. Diese Änderung verkleinert weder den serialisierten aktiven Zustand noch die Historie. Sie vermeidet wachsenden Kopieraufwand und zusätzliche temporäre Kopien. Dauerhaft wachsende Projektionsdaten und Archivverzeichnisse bleiben eine spätere Architekturaufgabe.

## Validierung

655 Tests bestanden, ein bestehender Test übersprungen. Neue Tests: eingefrorene Ausgangsprojektion, unveränderte frühere Momentaufnahmen, rückdatierte Buchungen, mehrere Einträge am selben Tag, centgenaue inklusive Zeitgrenzen, unveränderte Ausgangsdaten bei Fehlern und unabhängige Folgeprojektionen aus demselben Ausgangszustand. Bestehende Finanzarchivtests prüfen zusätzlich Originalbelege, Berichte, Export/Import und Wiederaufbau.

## Isolierte Messung

Synthetische Finanzhistorie mit zwölf Buchungen pro Tag und zehn Filialzuordnungen. Hinzugefügt werden zwölf Buchungen an einem neuen Tag und ein rückdatierter Eintrag. Zwei Anläufe und fünf Messungen je Variante, abwechselnde Reihenfolge. Node v24.19.0. Vollständige serialisierte Ergebnisse in allen drei Größen SHA-256-identisch; alte Eingaben unverändert.

| Historientage | Ausgangsgröße JSON | Median vorher | Median nachher |
|---|---:|---:|---:|
| 100 | 0.15 MB | 11.785 ms | 0.397 ms |
| 1000 | 1.55 MB | 98.558 ms | 0.221 ms |
| 5000 | 7.81 MB | 535.121 ms | 0.232 ms |

Nur Laufzeit der Projektionsaktualisierung. Keine Aussage über einen vollständigen Tagesvorlauf, 5.000 tatsächlich simulierte Tage, Browser, Archivkompression, IndexedDB, Cloud oder gemessenen RAM-Verbrauch. Der Ergebnisumfang bleibt identisch; bei 5.000 historischen Tagen bleiben 4.999 Tage im neuen Ergebnis gemeinsam genutzt.

Reproduktion: `node bench/projection-copy-replay.cjs --baseline <alte-financialProjection.ts> --output <neue-results.json>`. Keine Produktionsdaten oder Veröffentlichung.
