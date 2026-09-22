# Spielerlebnis – vier aufeinander aufbauende Ausbaustufen

> Aktualisierung: Die schematische Hofillustration aus Stufe 2 wurde auf Nutzerwunsch entfernt und durch einen integrierten kompakten Unternehmensauftritt ersetzt. Siehe audit/company-header/README.md. Firmenfarbe und Leitsatz bleiben erhalten.

## Umsetzung

1. Unternehmenswege im Büro: Verlässlichkeit, Menschen, Zukunft. Drei mit der aktiven Flotte skalierende Ziele; nur neue tatsächliche Ergebnisse zählen. Meilensteine werden einmalig vergeben. Wochenberichte entstehen am Wochenwechsel, acht bleiben unmittelbar verfügbar; ältere werden verlustfrei im vorhandenen Archiv erhalten.
2. Individueller Betriebshof: native SVG-Szene, Firmenfarben, Leitsatz, Tag/Nacht, reale Flottenzahlen und tatsächlich vorhandene PV-, Speicher- und Ladeausstattung. Fahrzeugdarstellung ist ausdrücklich schematisch. Animation folgt der bestehenden Einstellung und prefers-reduced-motion.
3. Persönliche Folgegeschichten unter Ziele & Entwicklung und in der Spielwelt: echte pünktliche Lieferung als Auslöser, konkreter Fahrer, bewusste Wahl zwischen Lernen und weiteren verlässlichen Lieferungen, Folgeszene erst nach echtem Ergebnis. Austritt beendet den Bogen nachvollziehbar. Höchstens ein aktiver Bogen, mindestens zehn Tage Abstand. Passende aktuell offene Kundenangebote werden als reguläre Marktchance verlinkt, nicht als erfundene Exklusivaufträge. Sechs jüngste Episoden direkt sichtbar, vollständige Abschlüsse archiviert.
4. Führungsziele unter Führung & Delegation und per Telefon: verlässlich liefern oder Team vor Wachstum. Filialleiter erhalten passende Prioritäten bei der normalen Maßnahmenplanung. Standortauftrag hat Vorrang vor Assistenzrahmen. Unveränderte Verantwortung, Budget- und Freigabeprüfungen. Bilanz am ersten Tageswechsel nach mindestens 14 Tagen. Pünktlichkeitsziel: mindestens zehn abgeschlossene Lieferungen und mindestens 90 % davon pünktlich. Personenziel ist ausdrücklich rechnerische Besetzung, keine Zusage über Urlaub/Schichten/Qualifikationen. Abgebrochene und abgeschlossene Aufträge bleiben archiviert.

## Daten und Laufzeit

Migration beim Laden, neuen Spiel und Engine-Befehl. Keine rückwirkend erfundenen Erfolge, keine Änderung existierender Produktionsspielstände. Kleine inkrementelle Zähler statt wiederholter Scans alter Historie. Wochenberichte und neue Bogen-/Führungsprüfungen am bestehenden Tageswechsel. Alle acht betroffenen Engine-Dateien sind bytegleich mit base44/shared. Bestehende Ereignisarchive werden verwendet, keine neue Cloud-Entity erforderlich.

## Nachweise und Grenzen

261 unterschiedliche Tests aus 24 Suiten bestanden (siehe validation.json und Logs). Ein veralteter Router-Mock im Bürotest musste um Link erweitert werden; die gesamte betroffene Suite wurde erneut erfolgreich ausgeführt. Geprüft: Ereignisfortschritt, Mehrfachaktionen, Mitarbeiterwechsel, echte Weiterbildung, Standorttrennung, Mindeststichprobe, Budget- und Verantwortungsgrenzen, Speicherisolation, Migration, DOM-Navigation sowie bestehende DACH-, Energie-, Welt-, Archiv-, Telefon- und Simulationskonsistenztests.

Lint der bearbeiteten Oberflächen erfolgreich. Neue Module und managementResponsibilities ohne Typfehler. Projektweiter Typcheck meldet 46 Fehler außerhalb dieser neuen Module; Einzelheiten im Log. Keine Behauptung eines vollständig fehlerfreien Projekt-Typchecks.

Keine visuelle Abnahme im echten Browser: hierfür war keine Browserfähigkeit verfügbar. DOM-/SSR-Tests und Produktionsbuild ersetzen keine Prüfung des tatsächlichen Layouts auf Mobilgerät und Desktop. Kein erneuter 200-Tage-Leistungstest; keine Garantie einer bestimmten Browser-Tagesvorlaufzeit.

## Vorschau-Abnahme

- Büro öffnen: Unternehmensname, Hof, Bewegungseinstellung und kleine Bildschirmbreite prüfen.
- Gestaltung ändern, speichern und Spielstand neu laden.
- Weg wählen; Entwicklung öffnen und später reale Folgegeschichte durchspielen.
- Führungskraft auswählen, Ziel per Oberfläche oder Telefon vergeben; Bericht und Budgetverhalten prüfen.
- Veröffentlichung ausschließlich über den bestehenden Base44-Publish-Ablauf. Diese Änderungen wurden nicht veröffentlicht.
