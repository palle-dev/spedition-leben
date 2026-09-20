# Einmalige lokale Speicherung der aktuellen Partie

## Änderung

`saveCurrent` schreibt den vollständigen aktuellen Zustand nur noch unter `current` bzw. `scenario_current`. `active_current` enthält einen kleinen, versionierten Verweis mit Ziel, Speicherzeit und Partie-ID. Zustand, neue Archivblöcke, aktive Auswahl und passende Sync-Metadaten werden in derselben IndexedDB-Transaktion gesichert. Synchrone Schreibfehler brechen die gesamte Transaktion ab.

Der Leser löst Auswahl und Ziel innerhalb EINER readonly-Transaktion auf, prüft erlaubte Zielnamen, Zeit und Partie-ID und meldet ungültige Verweise. Eingebettete alte Sicherungen bleiben lesbar und werden erst beim nächsten erfolgreichen Speichern umgestellt. Die Szenario-Löschung entfernt eine zugehörige aktive Auswahl atomar; freie Partien bleiben erhalten.

Keine Änderung der Simulation, Cloud-Schnittstelle, Exportdateien, manuellen Slots oder Autosave-Rotation. Keine Produktionsdaten geändert und kein Frontend veröffentlicht.

## Nachweis

- 610 Tests bestanden, 1 bestehender Test übersprungen.
- Produktionsbuild und Lint erfolgreich.
- Tests für einen statt zwei Zustandsschreibvorgänge, alte eingebettete Sicherungen, erfolgreiche und fehlgeschlagene Umstellung, ungültige/fehlende/fremde Verweise, Szenario-Wechsel und abgebrochene Speicherung einschließlich Sync-Metadaten.
- Privater Export als Kopie, vor der Messung mit aktueller Archivierung verdichtet; ursprüngliche Datei unverändert.
- Vorher: 2 vollständige Zustandswerte, 30.276.532 logische JSON-Bytes.
- Nachher: 1 vollständiger Zustandswert plus Verweis, 15.138.395 Bytes (ca. 50 % weniger).
- Geladener Zustand vor/nach Änderung tief identisch zur gespeicherten Eingabe.

Ausführung: `node bench/current-reference-replay.cjs --save /private/export.json --baseline /path/to/previous/src/lib --output audit/current-reference/replay.json`.

## Messgrenzen

Der Adapter nutzt echte `structuredClone`-Kopien und simuliert IndexedDB-Transaktionen im Arbeitsspeicher. Die erfassten Zeiten enthalten JSON-Größenberechnungen und sind KEINE Browser-, Datenträger- oder Tagesvorlaufmessung. Archivblöcke sind bei diesem wiederholten Speichervorgang bereits ausgelagert. Der Rückgang betrifft den aktuellen Snapshot; andere Slots, Archivvolumen, Cloud-Übertragung und Engine-Laufzeit bleiben davon unberührt. Browserprüfung mit großen realen Spielständen steht weiterhin aus.

## Kompatibilität und Rückkehr zu älterem Code

Die neue Version liest alte eingebettete `active_current`-Datensätze. Ein älteres Frontend versteht dagegen den neuen Verweis nicht. Für ein Downgrade muss der neue Leser beibehalten oder vorab die aktive Auswahl atomar wieder als eingebetteter Datensatz materialisiert werden. Die vollständigen Zustände bleiben in den bisherigen `current`/`scenario_current`-Schlüsseln erhalten. Alte und neue Frontend-Versionen sollten nicht gleichzeitig in mehreren Tabs verwendet werden.

## Nächste Architekturgrenzen

Auch ein einzelner aktiver Snapshot hat noch rund 15 MB. Weitere Schritte müssen die verbleibenden großen aktiven Daten, vollständige Zustandskopien, wachsende Archivverzeichnisse/Finanzprojektionen sowie Cloud-Laden und große Exportdateien adressieren. Dieses Inkrement allein belegt keine dauerhafte Tageslaufzeit unter 20 Sekunden.
