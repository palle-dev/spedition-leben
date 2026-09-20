# Bestätigte Auftragsbestände im Simulations-Worker

## Umsetzung

Der Worker hält zusätzlich zum bisherigen Finanzbestand den Auftragsbestand seines letzten erfolgreichen Ergebnisses. Der Client lässt Aufträge im nächsten Eingangspaket nur weg, wenn das Ergebnis nach den vorhandenen Speicher- und Sitzungsprüfungen ausdrücklich übernommen wurde und die Auftragsarray-Referenz unverändert ist. Die Oberfläche erhält rekursiv eingefrorene Auftragsdaten; der Worker arbeitet auf seiner eigenen veränderlichen Kopie. Austausch des Bestands führt zur vollständigen Übertragung. Finanz- und Auftragswiederverwendung sind getrennte Merkmale derselben bestätigten Revision.

Der Worker prüft die Revision vor Ausführung. Nur bei ausdrücklicher Ablehnung vor Befehlsausführung wird ein vollständiger Zustand nachgereicht. Unklare Fehler oder Abstürze lösen keine automatische Befehlswiederholung aus. Ein fehlerhafter Befehl verwirft den gehaltenen Bestand. Reset/Spielstandwechsel machen frühere Bestätigungen ungültig. Es wird höchstens der letzte Bestand gehalten, keine wachsende Liste alter Zustände.

Ergebnisnachrichten enthalten weiterhin alle Aufträge. Keine Spielregeln, Archivierungsfristen, Speicherformate oder historischen Daten geändert. Keine Produktionsspielstände bearbeitet, kein Frontend veröffentlicht.

## Nachweise

622 Tests bestanden, 1 bestehender Test übersprungen; Build und Lint erfolgreich. Sechs neue Tests prüfen Wiederverwendung bei echten Worker-Mutationen, Schutz der UI-Daten, Austausch vor/nach Bestätigung, Befehlsfehler mit Teiländerungen, verlorene Revision, fehlende Ergebnisübernahme und Reset. Bestehende Finanztransport- und Speicherprüfungen bleiben aktiv.

`bench/order-input-replay.cjs` vergleicht die vorige Version mit dieser Version in zwei echten Node-Worker-Threads anhand einer privaten Exportkopie mit 97 aktiven Fahrzeugen und 6 Standorten. Nach jedem Befehl sind die vollständigen Zustände tief identisch, einschließlich Finanzdaten und Archivverzeichnis. Der Ausgangsexport bleibt unverändert.

Aufruf: `node bench/order-input-replay.cjs --save /private/export.json --baseline /path/to/before --output audit/order-input/replay.json`.

| Befehl | Eingang vorher | Eingang nachher | Laufzeit vorher | Laufzeit nachher |
|---|---:|---:|---:|---:|
| +1 Stunde | 12.448.179 B | 6.455.813 B | 747 ms | 628 ms |
| +1 Tag | 12.452.312 B | 6.458.510 B | 5.157 ms | 4.985 ms |
| +1 Stunde anschließend | 12.602.268 B | 6.656.342 B | 631 ms | 558 ms |

Der erste Befehl überträgt weiterhin den vollständigen Zustand. Folgebefehle sparen hier rund 6 MB bzw. 47–48 % der bisherigen Eingangsdaten. Die Ausgabegröße bleibt praktisch gleich.

## Messgrenzen und Fortsetzung

Einzelne sequentielle Vergleiche, keine statistisch belastbare Beschleunigungszusage. Node-Worker mit echten strukturierten Kopien und produktiven Worker-Modulen; kein Browser, React, echtes IndexedDB oder Cloud. Die Zeiten umfassen Engine und Archivverdichtung; Kaltstart enthält Transpilierung. JSON-Größen sind logische Payload-Größen; Blob-Inhalte nicht enthalten. Langzeitspiele mit über 250 LKW und mehreren tausend Tagen sowie Tagesvorläufe durchgehend unter 20 Sekunden sind hiermit nicht nachgewiesen.

Die nächste Transportgrenze ist der weiterhin vollständige Rückweg der Aufträge und der übrige veränderliche Zustand. Archivverzeichnisse und Finanzprojektionen wachsen außerdem weiter. Eine weitergehende Differenzübertragung benötigt einen eigenen Nachweis für Änderungen, Löschungen, Reihenfolge und Fehlerfälle.

## Rücknahme

Keine Speichermigration; die vorherigen Client-/Worker-Dateien gemeinsam wiederherstellen. Bei neuen mutierenden UI-Verbrauchern müssen Aufträge vorher kopiert oder per Worker-Befehl geändert werden. Produktive UI-Lesepfade wurden überprüft; ein vollständiger Browser-Spieldurchlauf steht noch aus.
