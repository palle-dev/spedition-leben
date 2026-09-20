# Verlustfreie Auftragsverweise im Worker-Ergebnis

## Umsetzung

Vor der Befehlsausführung erfasst der Worker eine eigenständige Wertkopie der Aufträge. Nach Ausführung und Archivverdichtung werden unveränderte Aufträge mit eindeutiger ID durch ihren Index in diesem Ausgangsbestand ersetzt. Änderungen werden über einen rekursiven Wertvergleich erkannt, einschließlich verschachtelter Änderungen und gelöschter Felder. Kein Hash und kein bloßer Identitätsvergleich. Neue/geänderte Datensätze werden vollständig übertragen. Die Ergebnisliste legt Reihenfolge und Löschungen fest.

Die Oberfläche rekonstruiert aus der beim jeweiligen Aufruf erfassten, bereits unveränderlichen Quelle den vollständigen Auftragsbestand. Versionskennung, Quelllänge, Verweisgrenzen und mehrdeutige vollständige-plus-delta-Pakete werden geprüft. Doppelte Ausgangs-IDs, Zyklen und nicht einfache Objekte werden konservativ vollständig übertragen. Ohne Wiederverwendung bleibt die vollständige Antwort erhalten. Das bestehende Revisions-/Sitzungsprotokoll und die explizite Übernahme nach Speicherung bleiben bestehen. Fehler lösen keine automatische erneute Befehlsausführung aus.

Keine Engine-Regel, Speicherdatei, Archivierung oder Produktionspartie verändert. Frontend nicht veröffentlicht. Client, Runtime und neuer Transporthelfer bilden einen gemeinsamen Änderungsschritt.

## Prüfung und Messung

629 Tests bestanden, 1 bestehender Test übersprungen. Build und Lint erfolgreich. Sieben neue Tests decken verschachtelte In-place-Mutationen, neue/entfernte/umgeordnete Aufträge, fehlende Felder, undefined/null, NaN, Array-Lücken, doppelte IDs, Date-Objekte, Zyklen, leere Listen und fehlerhafte Verweise ab. Bestehende Client-/Worker-Tests für Fehler, Neustarts und nicht übernommene Ergebnisse bleiben aktiv.

Reproduktion: `node bench/order-output-replay.cjs --save /private/export.json --baseline /path/to/before --output audit/order-output/replay.json`.

Private Exportkopie mit 97 aktiven Fahrzeugen und 6 Standorten, tatsächliche Node-Worker-Threads mit Produktivmodulen. Vollständige Spielzustände nach jedem Befehl tief identisch. Ausgangsdatei unverändert. Ein erster Vergleich lief neben Tests; der dokumentierte Vergleich wurde anschließend ohne parallele Tests wiederholt, um konkurrierende Last auszuschließen.

| Befehl | Rückgabe vorher | Rückgabe nachher | Zeit vorher | Zeit nachher |
|---|---:|---:|---:|---:|
| Gehalt setzen (Kaltstart) | 12,46 MB | 6,50 MB | 1.711 ms | 1.813 ms |
| +1 Stunde | 13,39 MB | 7,50 MB | 599 ms | 633 ms |
| +1 Tag | 13,82 MB | 9,27 MB | 4.818 ms | 4.796 ms |
| +1 Stunde anschließend | 13,60 MB | 7,77 MB | 591 ms | 553 ms |

Die Rückgabe ist um etwa 33–48 % kleiner. Eine eindeutige Verbesserung der Gesamtlaufzeit ist nicht belegt: Vorabkopie und Vergleich kosten Worker-Rechenzeit und vorübergehend zusätzlichen Speicher. Die Einsparung betrifft den Rücktransport sowie die erneute Verarbeitung unveränderter Auftragsobjekte auf dem Hauptthread. Eingangsdaten unverändert gegenüber dem vorherigen Schritt.

## Grenzen / weitere Arbeit

Einzelmessungen, keine statistische Beschleunigungszusage. Node-Worker einschließlich Engine und Kompression, ohne React, echtes IndexedDB oder Cloud. Kaltstart enthält Transpilierung. JSON-Größen sind logische Payloads ohne Blob-Inhalte und keine Heap-Messungen. Browser-Reaktionsfähigkeit und Langzeitspiele mit 250+ LKW wurden hier nicht gemessen. Dauerhaft weniger als 20 Sekunden pro Tag ist nicht nachgewiesen.

Für weitere Verbesserungen müssen verbleibende Engine-Arbeit und wachsende aktive Daten gemessen werden. Ein späterer gezielter Änderungsnachweis direkt aus der Engine könnte den hier nötigen vollständigen Vergleich ersetzen, braucht aber eine vollständige Erfassung aller Mutationspfade. Der aktuelle Schritt setzt ausdrücklich nicht voraus, dass diese bereits erfasst sind.
