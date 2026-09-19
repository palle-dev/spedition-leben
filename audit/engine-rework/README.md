# Engine-Umbau – erste geprüfte Stufe

19.09.2026. Reale Ausgangslage: gespeicherter Lasttestzustand nach Tag 40, 50 LKW an zwei Standorten, etwa 21,5 MiB. Ein weiterer Tagesvorlauf ohne zusätzliche Testangebote oder Ausbau. Dies ist nicht identisch mit Tag 41 des wachsenden Belastungstests.

## Ergebnis
Drei sequenzielle Läufe je Codeversion in derselben getrennten Node-v24.19.0-Umgebung, ohne CPU-Profiler:
- Vorher: Median 47.975 s.
- Nachher: Median 14.617 s.
- Faktor 3.28, 69.5 % kürzere Laufzeit.
- Alle sechs vollständigen Ergebniszustände haben dieselbe SHA-256-Prüfsumme: 4da13bfc5a098e0915064e7cd27a1e7fff0799161500502f1d0dcbaedf8ac333.
- Date.now wurde für den Vergleich fixiert, sodass auch reale Ereigniszeitstempel vergleichbar sind; Laufzeiten mit performance.now gemessen.
- Je Lauf 67.690 Planprüfungen, gleiche Spielzeit und Lieferungen. Keine Historie entfernt, keine Spielregeln vereinfacht.

Diese Werte sind Engine-Zeiten auf einem separaten Rechner, keine Browser-Wartezeiten und nicht unmittelbar mit der Base44-Sandbox-Hardware vergleichbar. Die Belastbarkeit bei 250 LKW / Tag 200 ist noch nicht nachgewiesen. Das Ziel unter zehn Sekunden ist in diesem gealterten Testzustand noch nicht erreicht.

## Profil und Änderungen
Das Profil des alten Codes zeigte hohe Eigenzeit in Telefonkommunikation, linearen Auftragssuchen und dispatcherVehicleIds. Der Scheduler war in diesem Zustand kein Hauptengpass.
1. Kurzlebiger, verschachtelungssicherer Auftragsindex für reine Telefonprüfungen; nach Rückkehr/Fehler vollständig entfernt, keine Persistenz oder Wiederverwendung über Mutationen.
2. Telefonprüfungen verwenden die bereits berechneten Risiken erneut.
3. Disponenten-Auslastung wertet direkt zugeordnete Touren ohne Aufbau eines vollständigen Historienindex aus; Legacy-Fallback bleibt erhalten.
4. Tourensuche filtert den aktiven Kandidatenbestand einmal pro Aufruf statt die gesamte Historie je Fahrzeug. Kandidatenreihenfolge und Planungsergebnisse bleiben erhalten.
5. Mehrere Auftragsscans pro Disponentenprüfung sind zu einem Durchlauf zusammengefasst.
6. Bereits vorhandene Abweichungen der Browser-/Serverkopien in simulationEngine, marketEngine und worldEngine korrigiert. Vorhandene aktuelle Browserregeln zu Großkunden und Rivalen in die Serverkopien übernommen, keine neue Spielfunktion hinzugefügt.
7. Drei ungenutzte Imports in RivalActivityFeed entfernt, damit Lint wieder besteht.

## Prüfung
- 475 Tests bestanden, ein vorhandener Real-Save-Test ohne Fixture übersprungen.
- Produktionsbuild und ESLint erfolgreich in der isolierten vollständigen Projektkopie.
- Alle Simulationsmodule in src/lib/simulation und base44/shared nach dem Übertragen identisch.
- Vollständiger Typecheck weiterhin nicht grün: bestehende Typfehler sowie zusätzliche Abhängigkeitsdiagnosen in der lokalen Umgebung mit verlinkten node_modules. Kein vollständiger Typecheck-Erfolg behauptet.
- Neue Tests: keine veralteten Auftragsobjekte nach Mutationen, Wiederherstellung verschachtelter Indizes auch bei Fehlern, historische Fallbacks, Legacy-Touren und Verzicht auf Historienzugriff für zugeordnete Touren.

## Reproduktion und Fortsetzung
Rohmessungen: replay-comparison.json. CPU-Eigenzeiten: profile-summary.json.
Optimierten Code messen: node bench/replay-aged-state.cjs audit/endurance-200/state-day40.json.gz 3.
Vorher-Code aus audit/endurance-200/baseline-source.tgz in ein eigenes Verzeichnis entpacken und denselben Messharness sowie dieselbe Fixture dort ausführen.
Der aktive 200-Tage-Prozess verwendet seine bereits geladenen alten Module. Wiederaufnahme ausschließlich aus dem eingefrorenen Quellarchiv, wie im README des Langzeittests beschrieben. Keine Messläufe auf derselben CPU parallel zum Langzeittest gestartet. Übertragungs-/Sicherungsarbeiten sind kleine zusätzliche Systemlast.

Noch offen für den weiteren strukturellen Umbau: ältere/größere Zustände vermessen, aktive Indizes über gezielt invalidierte Operationsgrenzen erweitern, Ereigniswarteschlange und dauerhaft gehaltener Worker-Zustand anhand der danach verbleibenden Engpässe bewerten. Diese Stufe ist keine abgeschlossene Gesamtsanierung.
