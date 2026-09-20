# Import: privat eingelesenen Zustand direkt vorbereiten

Ausgangsstand: d346401acab5ace69aaf7e5a0cdf72ab483e9fd7.

`importSave` prüft weiterhin Format, Größe und Prüfsumme. Anschließend wird der von JSON.parse neu erzeugte, ausschließlich diesem Import gehörende Datenbaum mit `prepareOwnedLoadedState` vorbereitet. Eine zusätzliche vollständige Kopie entfällt. Fremde Spielstand- und Cloud-Zuordnungen werden weiterhin zurückgesetzt, die Echtzeit läuft nicht automatisch an. Archivprüfung und Wiederherstellung außerhalb dieser Funktion bleiben unverändert. Andere Aufrufer behalten die kopierende Standardfunktion.

## Messung

Kontrollierter Node-v24.19.0-Vergleich mit einer privaten Exportkopie (45.227.615 Bytes), unverändertes v2-Exportformat, ein Aufwärmpaar und drei Messpaare mit wechselnder Reihenfolge. Median vorher 1.156,44 ms, danach 839,19 ms (27,4 % weniger). Alle vollständig importierten Zustände wurden nach jedem Paar auf exakte Gleichheit geprüft; der ursprüngliche Zustand blieb unverändert. Messwerte in results.json enthalten keine privaten Spielinhalte.

Gemessen ist nur importSave einschließlich Größenprüfung, JSON-Parsing, Prüfsumme, Normalisierung und Identitätsreset. Nicht enthalten: Dateilesen, gzip, Archivwiederherstellung/-kompaktierung, echte Worker-Wartezeit, Browserdarstellung, Speichern oder Tagesberechnung. Keine Aussage über gesamte Ladezeit, Browser-Speicherspitze oder eine generelle 20-Sekunden-Grenze.

Reproduktion: `node bench/owned-import-replay.cjs --save /private/export.json --baseline /path/to/pristine --output /tmp/new-import-run`. Der Baseline-Ordner enthält den ursprünglichen src-Baum.

## Prüfung

679 Tests erfolgreich, ein bestehender Test übersprungen. Drei neue Tests prüfen Import-Isolation, Identitätsreset/pausierte Echtzeit, beschädigte Größe/Prüfsumme und ungültige Eingaben. ESLint und Base44-Produktionsbuild werden vor Übergabe geprüft. Keine Änderung an Simulation, Speicherformat oder Produktionsspielständen; keine Veröffentlichung durch den Agenten.
