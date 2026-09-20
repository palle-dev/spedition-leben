# Tourabschluss nach übersprungenem Einsatz — 2026-09-20

Baseline: c553bb9e09dfb0190d7ff71583939cf33579cb8d.

## Ursache / Korrektur
processTours übersprang nicht mehr verfügbare Aufträge, beendete aber eine Tour
nicht, wenn dies ihr letzter geplanter Einsatz war. Der Abschluss war nur im
Trip-Callback implementiert. In der Exportkopie lagen vier seit mehr als 30 Tagen
aktive Touren mit ausschließlich completed/skipped-Einsätzen.

Ein gemeinsamer Abschluss prüft nun sämtliche Einsätze einschließlich Rückfahrt:
nur completed/skipped, mindestens ein Einsatz, kein offener Störungsverweis und
kein laufender Trip (sowohl tourId als auch deployment.tripId geprüft). Aufruf
nach Skip, nach Tripabschluss und vor der normalen Tourverarbeitung.
Der Statuswechsel setzt completedAtMin und erzeugt genau ein Abschlusslog.
Bestehende terminale Touren werden vorher als tourLifecycleVersions verlustfrei
archiviert. Das normale Tourarchiv übernimmt den endgültigen Datensatz später.
Keine Rückdatierung eines unbekannten historischen Abschlusszeitpunkts.

Zusätzlich: Pausierte Touren mit laufender Fahrt werden nicht mehr pauschal
storniert; wiederholte Trip-Callbacks verändern keinen bereits abgeschlossenen
Einsatz und erzeugen keine zweite Abschlussmeldung. Stornierte Touren werden
durch einen nachträglichen Tripabschluss nicht wieder zu completed.
Frontend und base44/shared sind identisch.

## Nachweise
581 Tests erfolgreich, 1 vorhandener Test übersprungen. Build und ESLint erfolgreich.
Zehn gezielte Tests: Altstandkorrektur samt Archivzugriff, geplante/aktive Rückfahrt,
laufender Trip mit/ohne tourId, Störung, leere Tour, sofortiger Abschluss nach Skip,
idempotenter Callback, stornierte und pausierte Touren.

bench/tour-completion-replay.cjs --save /private/export.json
  --baseline /baseline/src/lib/simulation --output /tmp/metrics.json

Exportkopie: 97 aktive LKW, sechs Standorte. Vier bekannte Alt-Touren korrigiert;
Originale exakt erhalten. Isolierte Korrektur ändert keine sonstigen Zustandsfelder.
Drei Tage vollständige Engine vorher/nachher: alle Felder außer Touren,
historySequence, Archiv/Outbox und Journal/Projektion identisch. Finanzberichte
und die Originaljournalbelege separat geprüft, auch übrige Buchhaltungsfelder
identisch. Einmalige Zeitmessungen stehen im JSON, keine belastbare Speedup-Aussage.

## Grenzen
Keine Browser-/Cloud-Gesamtdauer, kein 250-LKW-/Langzeitnachweis.
Die Reparatur läuft bei der nächsten regulären Tourverarbeitung.
Touren mit offenen Rückfahrten, Störungen oder widersprüchlich laufenden Trips
bleiben absichtlich aktiv. Vier Touren allein erklären keinen großen Speicher-
oder Laufzeitgewinn; dies behebt eine Ursache dauerhaften Datenwachstums.
Produktive Spielstände nicht verändert; Website nicht veröffentlicht.
Frontend manuell veröffentlichen; gemeinsame Backend-Datei synchronisiert automatisch.
