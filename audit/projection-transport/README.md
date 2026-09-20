# Referenzen für unveränderte Finanzhistorientage

Ausgangscommit: `b402e2e1bd3caf75af092598472388f66851517d`.

## Änderung

Nach einer neuen Finanzarchivierung mussten bislang alle historischen Finanzprojektionstage zurück vom Worker an die Oberfläche übertragen werden. Die vorherige Änderung erhält unberührte Tage unveränderlich; diese Objektidentität wird jetzt innerhalb der jeweiligen Antwort genutzt.

Ein Antwortpaket enthält die aktuellen Projektionsmetadaten und eine geordnete Liste von Tageswerten oder Verweisen. Neue und rückdatierte/veränderte Tage bleiben vollständig enthalten. Unveränderte Tage werden aus dem Ausgangszustand genau dieses Auftrags rekonstruiert. Der bereits vorhandene Client-/Worker-Vertrag bindet Wiederverwendung an bestätigte Revision und Worker-Generation; nach Neustart wird ein vollständiger Zustand angefordert, bevor ein Befehl ausgeführt wird. Unsicher ausgeführte Befehle werden nicht automatisch wiederholt.

Schema, Ausgangszählung, Existenz jedes referenzierten Tages und eindeutige Tagesschlüssel werden geprüft. Widersprüchliche Pakete werden verworfen. Ohne passende unveränderte Tage gilt weiterhin die vollständige Übertragung. Der Worker friert die eingehende Finanzprojektion ein; direkte Änderungen würden einen Fehler auslösen, statt unbemerkt falsche Verweise zu erzeugen. `projectJournal` baut aktualisierte Tage unabhängig auf.

Es gibt keine Änderung an Spielregeln, Archivoriginalen, Speicherformat, Auswertungen oder Aufbewahrungsfristen. Die serialisierte Spielstandsgröße bleibt unverändert. Diese Änderung reduziert die Übertragung historischer Details; sie lagert die Projektion selbst noch nicht aus dem gespeicherten Zustand aus. Tagesverweise wachsen weiter mit der Zahl der Historientage.

## Messung

Synthetisches isoliertes Finanz-Antwortpaket: zwölf vorhandene Buchungen pro Tag, zehn Filialzuordnungen; anschließend eine neue und eine rückdatierte Buchung. Gemessen werden UTF-8-JSON-Bytes als Größenvergleich, nicht die tatsächlichen structured-clone-Bytes oder Laufzeiten.

| Historientage | Vollständige Antwort | Mit Verweisen | Weniger |
|---|---:|---:|---:|
| 100 | 154,631 Byte | 3,338 Byte | 97.84 % |
| 1000 | 1,554,202 Byte | 15,056 Byte | 99.03 % |
| 5000 | 7,810,203 Byte | 71,069 Byte | 99.09 % |

Alle rekonstruierten Zustände sind nach structured clone strukturell exakt gleich dem vollständig übertragenen Zustand. Die Zahlen gelten ausschließlich für den Finanzanteil, nicht für die gesamte Worker-Antwort, einen vollständigen Tagesvorlauf, die Dateigröße oder Browser-/Cloud-Dauer. Kein 5.000-Tage-Spielverlauf wurde ausgeführt.

Reproduktion: `node bench/projection-transport-replay.cjs /tmp/neue-results.json`.

## Prüfungen

Neue Tests: neue/unveränderte/rückdatierte Tage, vollständige Übertragung unabhängiger importierter Projektionen, unveränderte Gesamtprojektion, Entfernung einer Projektion, ungültige Versionen/Verweise/Duplikate/widersprüchliche Pakete, unberührter Ausgangszustand, bestätigte aufeinanderfolgende Worker-Revisionen, verlorener Worker-Zustand und Ablehnung direkter Änderungen historischer Tage. Bestehende Finanz-, Archiv-, Import-/Export- und Worker-Tests bleiben Teil der Prüfung. Keine Produktionsdaten verändert und kein Frontend veröffentlicht.

662 Tests bestanden, ein bestehender Test übersprungen. Lint erfolgreich.
