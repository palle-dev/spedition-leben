# Große Spielstände und verlustfreies Archiv — 2026-09-20

## Umsetzung

- JSON-Importgrenze 256 MiB statt 50 MiB; komprimierte JSON-Dateien werden ebenfalls akzeptiert. Für gzip gilt die Grenze auch auf den entpackten JSON-Inhalt. Dateilesen, JSON-Prüfung, bestehende FNV-Prüfsumme, Archiv-SHA256 und Komprimierung laufen in einem eigenen Worker. Ein fehlerhafter Import verändert/pausiert die laufende Partie nicht. Ein erfolgreicher Import sichert die vorige Partie und erhält eine neue Party-ID.
- Neue Exporte sind `.json.gz` (Fallback JSON ohne CompressionStream). Sie enthalten den gesamten aktuellen Zustand und sämtliche Archivblöcke. Import akzeptiert alte Exportversionen 1/2; die bestehenden Größen- und Prüfsummenprüfungen bleiben aktiv.
- Nie angenommene, abgelaufene Marktangebote älter als zwei Tage und erledigte Buchhaltungsaufgaben älter als sieben Tage wandern in immutable gzip-Blob-Blöcke (max. 1000 Datensätze/Block). Explizit referenzierte Aufträge werden konservativ behalten, auch in Verträgen, Touren, Freigaben, Mails und Buchhaltungsbelegen. Finanzjournal, Salden, angenommene/ausgeführte Aufträge und offene Vorgänge werden nicht gekürzt.
- Lokale aktive Zustände, manuelle Slots und Autosaves speichern die Blob-Blöcke zusammen mit dem Zustand atomar über die vorhandenen benutzergetrennten IndexedDB-Schlüssel. Keine separaten losen Archivdateien oder Referenzen, kein Garbage-Collection-/Versionsverlust bei Slotwechseln. Structured clone teilt immutable Blob-Inhalte; die alten Objektlisten werden weder durch die Engine gescannt noch erneut als Objektbäume geklont. Einmal pro Spieltag wird nach weiteren Archivkandidaten gesucht.
- Cloud-Sicherung bettet die komprimierten Blöcke als Base64 ein; Eigentumsprüfung und Konfliktrevisionen sind unverändert. Laden prüft und stellt Blobs wieder her. Roh-JSON-Export von Blobs wird ausdrücklich abgelehnt, um stille `{}`-Datenverluste zu verhindern. Der alte synchrone localStorage-Fallback lehnt archivierte Stände ebenfalls ab; IndexedDB ist dann der lokale Speicher. Bei dessen Fehler bleibt der bisherige Speicherstand erhalten und die vorhandene Fehleranzeige fordert zum Export auf.
- Im Spielstände-Dialog: Lade-/Exportanzeige, Archivzähler und separater lesbarer Archivdownload. Archivdownload ist ein Recherche-JSON, kein importierbarer Spielstand; für Wiederherstellung den regulären Export verwenden.

## Nachweise

`metrics.json`: kontrollierte Kopie des vom Nutzer bereitgestellten Exports, 97 aktive Lkw, 6 Standorte. Produktionsdaten wurden nicht verändert.

| Messung | Vorher | Nachher |
|---|---:|---:|
| Aktiver JSON-Datenbestand (ohne Blob-Nutzdaten) | 45.227.555 Bytes | 25.280.352 Bytes |
| Ausgelagerte Originaldatensätze | — | 33.158 |
| Archiv (komprimierte Blob-Nutzdaten) | — | 1.286.169 Bytes |
| Vollständiger neuer Datei-Export | — | 3.093.354 Bytes |
| Aufträge im aktiven Zustand | 30.143 | 5.924 |
| Buchhaltungsaufgaben im aktiven Zustand | 10.154 | 1.215 |

Archivierung 708 ms, gzip-Export 854 ms, Import inklusive Validierung 1007 ms in dieser lokalen Node-Messung.

Drei aufeinanderfolgende Tagesvorläufe: vorher 6,52 / 4,71 / 5,87 s, nachher 4,60 / 3,90 / 3,74 s. Alle spielwirksamen Zustandsfelder nach jedem Tag vollständig gleich; nur ausdrücklich ausgelagerte Historien/Archivmetadaten werden beim Vergleich ausgeschlossen. Vollständiger Datei-Roundtrip samt Archivblöcken geprüft.

504 Tests bestanden, 1 bestehender Test übersprungen. Darunter echter Import einer >51-MiB-JSON-Datei, gzip-Roundtrip, Prüfsummenfehler, Archivoriginale, Referenzerhalt, Kompressionsfehler ohne Quellenänderung, Benutzertrennung und IndexedDB-Transaktionsabbruch mit Erhalt des bisherigen Stands. Produktionsbuild und ESLint erfolgreich (bestehende Bundle-Warnungen).

## Messgrenzen und bewusster Umfang

Engine-/Dateiverarbeitungszeiten auf Node v24.19.0, keine Browser-Gesamtdauer und keine Leistungszusage für Endgeräte. Kein produktiver Cloud-Save zum Test ausgelöst. IndexedDB-Transaktionsverhalten durch Vertragsadapter getestet; ein manueller Browser-Roundtrip nach Veröffentlichung bleibt sinnvoll.

Finanzjournal bleibt vollständig aktiv: Diese Änderung beseitigt dessen langfristiges Wachstum nicht. Für eine spätere Auslagerung benötigt es belastbare historische Salden-/GuV-/Cashflow-Aggregate, Nachladen von Journaldetails und Schutz rückabwickelbarer Buchungen. Auch die bisherige zeitgesteuerte Bereinigung anderer Historien bleibt unverändert; bereits früher entfernte Daten werden nicht wiederhergestellt. Die aktuelle Archivierung erhält die oben genannten Daten ab dem Laden mit dieser Version und bei normalen fortlaufenden Tagesvorläufen. Sehr große einzelne Mehrtagesbefehle können weiterhin die bestehende 30-Tage-Bereinigung von Marktangeboten erreichen, bevor der Worker nach dem Befehl archiviert.

Reproduzieren: `node bench/archive-replay.cjs --save /privater/pfad/export.json --output /tmp/archive-metrics.json`. Keine Spielstandsdateien ins Repository legen.
