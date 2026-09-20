# Lokale Sicherung vor dem Entpacken auswählen

Ausgangscommit: `f2ab66d458912ffad5e9f58c27fa6368cfa2bb5e`.

## Befund

Fehlt die aktive Auswahl (Legacy/Fallback), wurden freie Partie und Szenario bisher über `idbGet` beide vollständig rekonstruiert und erst danach anhand von savedAt ausgewählt. Seit der komprimierten Finanzspeicherung bedeutet das zwei Entpackvorgänge. Eine kaputte ältere Finanzhistorie konnte Promise.all ablehnen und dadurch den intakten neueren Stand blockieren.

## Änderung

Interne rohe Datensatzabfrage von der Rekonstruktion getrennt. `loadCurrent` liest Auswahl bzw. Fallback-Kandidaten, entscheidet anhand derselben bisherigen Zeitstempelregeln und prüft eine neuere nutzerbezogene Recovery-Kopie. Erst der tatsächlich gewählte IndexedDB-Datensatz wird entpackt. Alle anderen öffentlichen Ladewege verwenden weiterhin die vollständig rekonstruierende Abfrage. Prüfung von aktiver Auswahl, Partie und Zeitstempel bleibt unverändert.

Ist der gewählte Stand beschädigt, bleibt das ein Fehler (bzw. der bereits vorhandene Recovery-Fallback greift). Es wird nicht stillschweigend ein älterer IndexedDB-Stand geladen. Die ungewählte ältere Sicherung bleibt unangetastet, auch wenn sie beschädigt ist.

## Nachweise

672 Tests bestanden, ein bestehender Test übersprungen; Lint erfolgreich. Drei neue Regressionstests: intakte neuere Sicherung trotz beschädigter älterer, Fehler bei beschädigter ausgewählter neuerer Sicherung, genau ein Dekompressionsaufruf bei zwei vorhandenen komprimierten Kandidaten und kein zusätzlicher Aufruf bei neuerer Recovery-Kopie. Testzustände enthalten jeweils 1.000 synthetische Finanzhistorientage. Alle gelesenen Felder stimmen mit dem erwarteten Zustand überein.

IndexedDB-Transaktions-Vertragsadapter mit structured clone, keine echte Browsermessung. Nachgewiesen ist der vermiedene zusätzliche Entpackvorgang, keine konkrete Verbesserung der Ladezeit in Sekunden. Speicherformat und Datenbestand unverändert. Keine Produktionsdaten verändert, kein Frontend veröffentlicht.
