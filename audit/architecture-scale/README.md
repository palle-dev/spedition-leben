# FRACHTFIEBER: Architektur für große Flotten und lange Spielstände

Stand der Prüfung: 20.09.2026. Geprüfter App-Commit: `73db1ff9fc90160aa402c4ca5a840692b63746b6`. Architekturprüfung und isolierte Fehlerreproduktion; keine Änderung der Spiellogik, kein Zugriff auf produktive Spielstände, keine Veröffentlichung. Die hier beschriebene Zielarchitektur ist noch nicht implementiert.

## Entscheidung

Der monolithische Spielstand muss durch getrennte Speicher- und Ausführungsmodelle ersetzt werden. Eine größere Importgrenze, weitere gzip-Komprimierung oder ein schnellerer Server allein lösen die strukturellen Probleme nicht. Geschäftsregeln und bestehende Oberfläche sollen weiterverwendet werden; Ausführung, Datenzugriff, Historien und Persistenz werden schrittweise ersetzt.

Empfehlung als langfristiges Ziel: Base44 als Oberfläche und Zugang, ein autoritativer Simulationsdienst mit kontrollierten Ressourcen, PostgreSQL für aktuelle Daten und abfragbare Historien, versionierte Sicherungen in Objektspeicher sowie IndexedDB als lokaler Cache. Ein dauerhaft zuständiger Browser-Worker ist ein sinnvoller Zwischenschritt und möglicher Ausführungsadapter, aber kein garantierter Ersatz für einen kontrollierten Serverbetrieb auf beliebigen Endgeräten.

Die Laufzeit darf von aktiven Fahrzeugen, offenen Aufträgen und tatsächlich fälligen Ereignissen abhängen. Sie darf nicht proportional zur gesamten vergangenen Spielhistorie steigen. Historische Daten dürfen wachsen; der pro Befehl gelesene, kopierte und gespeicherte Ausschnitt muss begrenzt bleiben.

## Nachgewiesene Probleme im aktuellen Code

| Befund | Nachweis | Folge |
|---|---|---|
| Vollständiger Zustand zwischen UI und Worker pro Befehl | `src/lib/gameContext.jsx: executeInWorker`; `src/lib/simulationWorker.js` | CPU und Speicher für Objektkopien; der Worker hält keinen allein verantworteten Zustand zwischen Befehlen. Immutable Archiv-Blobs sind günstiger zu klonen als Objektlisten, beseitigen das Modell aber nicht. |
| Ganze Zustände werden wiederholt gespeichert | `gameContext.jsx: saveNow`, Autosave, Cloud-Upload; `persistence.js: saveCurrent` | Vollständige strukturierte Kopien und zwei aktuelle Schlüssel pro Commit, zusätzliche Autosaves und manuelle Slots. Physische Blob-Deduplizierung ist browserabhängig und wurde nicht gemessen. |
| Cloud schreibt weiterhin vollständige Snapshots mit allen Archiven | `cloudSync.js: portableHistory`; Backend `cloudSync/entry.ts: save` | Netzwerk- und Schreibaufwand wachsen mit dem Spielalter. Vorhandene Revision-/Eigentumsprüfung ist zu erhalten. |
| Bereits die Cloud-Auswahlliste liest vollständige Entity-Datensätze im Backend | `cloudSync/entry.ts: list`, `S.filter(..., 100)` ohne Feldauswahl | Erst nach dem Datenbankabruf wird auf Metadaten reduziert. Für eine Liste ist `state` unnötig. Die aktuelle SDK-Dokumentation unterstützt Feldauswahl; Kompatibilität mit dem eingebundenen Backend-SDK vor Änderung prüfen. |
| Historien sind überwiegend Arrays im aktiven Zustand | `accountingEngine.ts: journal.push`, weitere Fachmodule | Journal, erledigte Verträge und weitere Lebenslaufdaten können weiter wachsen; vorhandene Salden-/Tages-Caches lösen das nur teilweise. |
| Nächstes Ereignis durch erneute Gesamtsuche | `eventScheduler.ts: earliestEventAfter`; `simulationEngine.ts: processEventsAt` | Pro Ereignis erneute Suchen in zahlreichen Sammlungen, gefolgt von weiteren Scans bei der Verarbeitung. Der Auftrags-Arbeitsindex verbessert einen Teil, nicht alle Fachbereiche. |
| Disposition wiederholt globale Auswahl | `dispatcherProcessor.ts`, `tourEngine.ts: suggestTours` | Filter-/Sortierarbeit über den Auftragspool pro Fahrzeug und wiederholte Suche. Bereits begrenzt auf höchstens 4 Fahrer und 12–24 Auftragskandidaten; die Paarbildung ist deshalb begrenzt, die vorbereitenden Gesamtscans bleiben. Kein unbeschränktes O(Aufträge²) über den gesamten Markt behaupten. |
| Breite UI-Zustandsverteilung | `gameContext.jsx: GameContext.Provider` | Viele Verbraucher erhalten bei State-Wechsel neue Kontextwerte. Ob und wie teuer einzelne Ansichten rendern, muss im Browser profiliert werden. |
| Archive werden beim Laden vollständig geprüft/entpackt | `historyArchive.js: restoreHistory` | Zwar blockweise und ohne alle Originalobjekte gleichzeitig zu halten, aber die Startzeit wächst mit sämtlichen Archivblöcken. Cloud/Export kodieren ebenfalls alle Blöcke neu. |
| Neue technische Endgrenzen | `historyArchive.js: chunksOf`, `saveFileTasks.js` | Maximal 20.000 Archivblöcke und 256 MiB entpacktes Export-JSON. Damit keine Lösung für unbegrenzt weiterwachsende Partien. |
| Archiv nur für zwei Kategorien und als Download verfügbar | `historyArchive.js: KINDS`, `SaveSlotsDialog.jsx` | Abgelaufene nie angenommene Angebote und erledigte Buchhaltungsaufgaben erhalten; kein allgemeiner im Spiel durchsuchbarer Historienzugriff. |
| Andere Historiendaten werden tatsächlich gelöscht | `historyCleanup.ts`; `eventLog.ts`; `investmentEngine.ts`; `delegationEngine.ts`; `assistantEngine.ts` | U. a. abgeschlossene Fahrten/Touren nach 7 Tagen, erledigte Aufträge nach 30 Tagen, Belege/Buchungen auf 200 Einträge begrenzt, weitere Grenzen für Meldungen, Entscheidungen, Investmentausführungen und Transfers. Teilweise Kopien/Zusammenfassungen bleiben, die Originaldetails nicht vollständig. |
| Finanzhistorien hängen von heutigen Stammdaten ab | `accountingData.js: getBranchFinancials` | Umsatz-/Kostenzuordnung nutzt heutige Fahrzeugfiliale, Personalhistorie wird aus heutigen Mitarbeitern/Kostensätzen angenähert. Historische Richtigkeit erfordert zeitbezogene Geschäftsfakten. |

Ein weiteres gzip-Archiv innerhalb desselben `state` ist daher nur eine Übergangslösung. Auch die kürzlich berichteten 3,7–4,6 Sekunden beziehen sich auf drei Engine-Vorläufe mit 97 Lkw, nicht auf die geforderte Langzeitdimension. Der eingefrorene alte 200-Tage-Test ist ebenfalls kein Nachweis für den aktuellen Code bei 1.000 Fahrzeugen oder 10.000 Tagen.

## Konkret reproduzierter Fehler bei historischen Filialauswertungen

`node audit/architecture-scale/reproduce.cjs` führt den produktiven Auswertungscode mit einem isolierten synthetischen Zustand aus. Ergebnisse stehen in `historical-report-reproduction.json`.

- Historische Lieferung: 100 Euro Umsatz für Filiale A, 11 Euro direkte Kosten.
- Wird das Fahrzeug später nach B versetzt, zeigt die unveränderte historische Periode plötzlich 0 Euro für A und 100 Euro für B.
- Wird ausschließlich die bestehende Historienbereinigung ausgeführt, verschwindet der historische Umsatz aus beiden Filialauswertungen, weil die Verknüpfung zur alten Fahrt fehlt. Der Auftrag selbst ist im Beispiel noch vorhanden.

Das zeigt Daten-/Auswertungsfehler, nicht nur ein Geschwindigkeitsproblem. Bereits vollständig gelöschte Details lassen sich nur aus noch vorhandenen Exporten/Backups zurückholen. Wo das nicht möglich ist, sind Zeiträume als unvollständig zu kennzeichnen; Details dürfen nicht erfunden werden.

## Getrennte Datenbereiche

| Bereich | Inhalt | Speicherung und Zugriff |
|---|---|---|
| Aktive Simulation | Aktive Flotte, Personal, offene Transporte/Verpflichtungen, laufende Touren, offene Entscheidungen, aktuelle Salden, deterministischer Zufallszustand | Genau eine Ausführungsinstanz je Partie; ID-Indizes und fachliche Teilindizes, kompakte versionierte Wiederaufnahmepunkte |
| Geschäftshistorie | Unveränderte Auftragsabschlüsse, Fahrtphasen, Belege, Journal, Entscheidungen, E-Mails, Vertrags-/Personal-/Investmentereignisse und benötigte damalige Stammdaten | Eigene persistente Datensätze, indiziert nach Partie, Zeitpunkt und fachlichen IDs; UI lädt nur benötigte Seiten |
| Auswertungen | Konto-/Filial-/Kunden-/Fahrzeugkennzahlen je Zeitraum | Inkrementelle Summen/Projektionen mit Versions- und Vollständigkeitsstatus, aus Originalen überprüfbar und wiederaufbaubar |
| Große historische Blöcke / Sicherungen | Unveränderliche Details, Snapshots, Exportteile | Objektspeicher nach Bedarf; kleiner Suchindex/Manifest in Datenbank. Nicht eine Datenbankpartition pro Partei und Spieltag erzeugen. |
| UI-Cache | Sichtbare Tabellenzeile, Karte, Dashboard, gerade geöffneter Bericht | Begrenzter Cache und seitenspezifische Daten; kein zweiter vollständiger Weltzustand |

Alle bestehenden fachlichen Originaldaten sollen dauerhaft zugänglich bleiben. Abgeleitete Suchindizes, React-Zustände und Wegwerf-Caches müssen nicht historisiert werden. Erzeugte Marktdaten, Preisverläufe und Entscheidungen sind dagegen nicht ohne Weiteres reproduzierbare Caches und gehören in die fachliche Historie, wenn sie bisher Bestandteil des Spielstands waren.

Eine historische Lieferung muss ihre damalige Filiale, Fahrzeugeinsatz, Kundenzuordnung und gebuchten Beträge festhalten. Referenzen auf heutige Stammdaten dienen Navigation, dürfen den damaligen Sachverhalt aber nicht überschreiben. Korrekturen werden nachvollziehbar ergänzt, insbesondere im Journal als Gegen-/Korrekturbuchungen.

## Ausführung und Kommunikation

1. **Eine verantwortliche Instanz pro Partie.** UI sendet `commandId`, erwartete Revision und Parameter. Der Executor besitzt den aktiven Zustand und serialisiert Mutationen. Ein Retry liefert das gespeicherte Ergebnis derselben commandId; keine zweite Zahlung, kein zweiter Tagesvorlauf.
2. **Keine Weltkopie pro Klick.** Zur UI gehen Bestätigung, Fortschritt und Änderungen an den sichtbaren Daten. Fachliche Abfragen liefern begrenzte Seiten/Ansichten. Volle Snapshots nur bei Initialisierung, Wiederherstellung oder explizitem Export.
3. **Echte Ereigniswarteschlange.** Termine nach `(Spielminute, fachliche Priorität, stabile Sequenz)` verwalten. Neue/verschobene Vorgänge aktualisieren ihre Termine. Bei einem Ereignis werden nur betroffene Objekte verarbeitet. Veraltete Termine über Objektversionen verwerfen; Warteschlange darf nicht selbst durch ungültige Alttermine unbegrenzt wachsen.
4. **Disposition lokal und bei Änderungen.** Indizes nach Standort/Region, Fahrzeugklasse, Zeitfenster und Status. Nur betroffene Pools neu planen, Änderungen desselben Zeitpunkts bündeln. Standortübergreifende Arbeit und gemeinsame Liquidität benötigen zentrale Reservierungen.
5. **Deterministische Arbeit statt hardwareabhängiger Spielregeln.** Keine Kandidaten aufgrund verstrichener Echtzeit überspringen. Große Arbeiten fortsetzbar in begrenzte Arbeitspakete schneiden, mit unveränderter Reihenfolge. Telefon-/Fortschrittsanzeige darf die fachliche Simulation nicht beeinflussen.
6. **Keine Datenbankabfrage je Simulationsminute.** Offene Verpflichtungen und benötigte Daten bleiben im Arbeitssatz; Historien entstehen als gebündelte Schreibmenge. Persistierung an sicheren Ereignisgrenzen. Kurze Pakete erlauben Fortschritt, Abbruch zwischen Paketen und Wiederaufnahme nach Absturz.
7. **Gemeinsamer Simulationskern.** Browser- und Serveradapter verwenden denselben getesteten Kern; die derzeit manuell duplizierten `src/lib/simulation`-/`base44/shared`-Dateien durch eine gemeinsame Quelle oder überprüfte Build-Ausgabe ersetzen. Eine Partie darf nicht gleichzeitig von Browser und Server fortgeschrieben werden.

## Datenverlust verhindern

Ein abgeschlossener Vorgang darf erst aus dem aktiven Arbeitssatz entfernt werden, wenn Originaldaten und Wiederaufnahmezustand zusammen sicher gespeichert sind. Im lokalen IndexedDB-Fall gehören aktive Änderung, Historienzeilen, Projektionsänderung, commandId und Revision in eine Transaktion. Im PostgreSQL-Fall gilt dieselbe atomare Grenze für die Datenbankdatensätze.

Objektspeicher und Datenbank besitzen keine gemeinsame Transaktion: erst unveränderliche Blöcke hochladen und Hash/Länge prüfen; dann ihre Referenzen zusammen mit neuer Revision und Fortschrittsmarke verbindlich schreiben. Bei Fehler bleibt die alte Revision gültig. Nicht referenzierte Uploads erst später bereinigen. Alle manuellen Slots, Backups und Partiezweige sind dabei erreichbare Wurzeln und müssen ihre Daten behalten.

Fortschrittspaket, Zufallszustand, geplante Ereignisse, Engine-/Schemaversion und Befehlsergebnis müssen denselben Commit repräsentieren. Wird der Worker nach Commit, aber vor Antwort beendet, ist das Ergebnis anhand der commandId wiederherstellbar. Serverseitig verhindern Lease mit Fencing-Token und Revisionsprüfung, dass ein abgelöster Executor später schreibt.

Der Zustand „lokal gesichert“ und „Cloud-bestätigt“ muss getrennt sichtbar sein. Noch nicht hochgeladene Offline-Änderungen können bei vollständigem Geräteverlust nicht garantiert gerettet werden. Deshalb für das zuverlässigste Zielmodell serverbestätigte Commits bevorzugen und mehrere versionierte Sicherungen mit regelmäßig geprüftem Restore vorhalten. Reiner Browser-Speicher ist dafür keine hinreichende einzige Kopie.

## Alle Daten bleiben im Spiel erreichbar

- Auftrags-, Fahrzeug-, Personal- und Kundenansichten bieten dieselben Filter über aktuelle und historische Datensätze; Archivierung erfordert keinen Dateidownload.
- Listen verwenden stabile Cursor, z. B. `(Zeitpunkt, ID)`, begrenzte Seitengrößen und passende zusammengesetzte Indizes, keine vollständigen Array-Downloads oder tiefe Offset-Scans.
- Alte Belege und Touren werden gezielt nachgeladen. Verknüpfte Details erhalten ihre damaligen Werte.
- Langzeitdiagramme verwenden Tag-/Monatssummen passend zur Auflösung; Detailklick lädt die zugrunde liegenden Originale. Voraggregierte Werte ersetzen diese Originale nicht.
- Finanzberichte rechnen über korrekt gebuchte Fakten und geprüfte Summen. Kontostand, GuV, Cashflow, private/geschäftliche Depots und Korrekturbuchungen müssen vor/nach Migration identisch sein. Tagesaggregate allein reichen nicht für beliebige minutengenaue Berichte.
- Für Altbestände: Vollständigkeitsmarkierung je Bereich und Zeitraum. Bestehende fehlerhafte historische Zuordnungen nicht still als exakte Daten ausgeben.

## Speicher-/Betriebsvarianten

| Variante | Eignung | Grenze / Voraussetzung |
|---|---|---|
| Persistenter Browser-Worker + getrennte IndexedDB-Historie + Cloud-Blöcke | Guter inkrementeller Übergang, geringe zusätzliche Server-Rechenkosten, Offline-Spiel möglich | Endgerät begrenzt CPU/RAM; Browserquoten/-löschung; vollständige Cloud-Referenzen und Wiederherstellung erforderlich |
| Vollständig Base44 mit normalisierten Entities und getrennten Archivblöcken | Bestehenden Betrieb weitgehend behalten | Vorab verbindlich prüfen: Indizes, atomare Mehrdatensatz-Commits/CAS, Uploadgrößen, Abfragekosten, Zeitlimits und Job-Wiederaufnahme. SDK-CRUD allein ist kein Nachweis dafür. Keine unbelegten Plattformlimits behaupten. |
| Base44-Oberfläche + eigener Simulationsdienst + PostgreSQL + Objektspeicher | Empfohlenes langfristiges Ziel für kontrollierte Laufzeit und nachvollziehbare Historien | Zusätzlicher Betrieb, Monitoring, Authentifizierung/Autorisierung, Backup und laufende Infrastrukturkosten; Online-Verbindung für verbindliche Befehle |

PostgreSQL bietet kontrollierbare Indizes und Partitionierung. Zunächst passende Indizes und Abfragemodelle; Partitionierung erst nach gemessener Datenmenge/Abfrageverhalten. Ein eigener Executor bedeutet keine Microservice-Landschaft: ein modularer Dienst plus Datenbank und Sicherungsspeicher genügt als Start. Benutzer-/Partieberechtigung gilt auch für Objekt-Downloads und Archivabfragen, nicht nur für den aktuellen Snapshot.

## Umsetzung in einzeln abnehmbaren Schritten

1. **Verlustfreie Speichergrenze und Dateninventar:** Alle Kürzungs-/Löschstellen fachlich klassifizieren. Historien-Repository, Originaldatensätze und atomaren Übergang implementieren. Bestehende Originaldateien bewahren; Migration in neue Generation mit Zählungen, Hashes, Referenz- und Saldenprüfung. Bereinigung erst auf „sicher gespeichert → aus Arbeitssatz entnehmen“ umstellen. Nicht bloß alle bisherigen Grenzen ausschalten und damit den Monolithen weiter aufblasen.
2. **Historienabfragen und Finanzrichtigkeit:** UI und Auswertungen auf Repository/Projektionen umstellen, den reproduzierten Filialfehler beheben. Alten und neuen Leseweg vorübergehend vergleichen; nicht zwei unabhängige Schreibpfade als Wahrheit betreiben. Finanzjournal erst nach bewiesener Gleichheit aus dem heißen Zustand entfernen.
3. **Ein zuständiger Executor und kleine UI-Antworten:** Bestehende Regeln hinter einen seriellen Command-Vertrag stellen, dauerhaften Workerzustand, aktive Checkpoints und Delta-/Abfrageantworten einführen. Migration nur beim Laden einer alten Schemaversion, nicht als dauernder globaler Reparaturdurchlauf.
4. **Ereignisplanung und Disposition:** Fachbereiche einzeln auf Terminwarteschlange und gezielte Neuplanung umstellen. Reihenfolge, Reservierungen, Arbeitszeiten, Pünktlichkeit und Chunk-Konsistenz prüfen. Parallelisierung erst nach Messung; reine Planvorschläge können parallel berechnet werden, Commit/Reservierungen bleiben geordnet.
5. **Inkrementeller Cloud-Sync und Export:** Nur neue Historienblöcke und geänderte aktive Daten übertragen. Erst vollständige Generation als gespeichert bestätigen. Export als gestreamtes Paket aus Manifest, aktiven Daten und Blöcken; Import blockweise mit begrenztem Speicher, Prüfsummen und Wiederaufnahme. Schutzgrenzen pro Block und Speicherquote beibehalten, die gesamte Spielkarriere aber nicht auf ein einziges 256-MiB-JSON begrenzen.
6. **Serverbetrieb und kontrollierte Ausrollung:** Gemeinsamen Kern als wiederaufnehmbaren Job betreiben; Leistungsbudgets und Nutzerzahl dimensionieren. Bestehende Spiele einzeln migrieren, zuerst Testkopien, dann opt-in/neue Version. Alte Sicherungen bis zum bestätigten Restore behalten. Kein gleichzeitiger Browser-/Serverfortschritt derselben Partie.

## Abnahme und Leistungsnachweis

Zielmatrix: 250/500/1.000 aktive Lkw × 10/25/50 Standorte × Spieltag 100/1.000/5.000/10.000, mit realistischen Fahrern, Schichten, Liquidität, Auftragsdichte und echten Lieferungen. Nicht alle Kombinationen müssen zuerst vollständig real durchgespielt werden: große historische Fixtures prüfen Speicherung/Abfragen, reale fortlaufende Läufe prüfen fachliches Wachstum. Synthetisch vervielfachte Datensätze sind kein Ersatz für den Dauerlauf.

- Erst Zielhardware, Browser/Serverressourcen und parallele Nutzerlast festlegen; danach p50/p95/Maximum für 1 Std und 1 Tag messen, einschließlich Queue, Commit, Übertragung und UI. Das gewünschte Tagesziel unter 20 Sekunden ist ein Abnahmekriterium, keine bereits belegte Zusage. Zielreserve darunter einplanen.
- Gleiche aktive Betriebssituation mit unterschiedlich großer Historie: Speicherbedarf des Executors und Tageslauf dürfen nicht proportional zum Spielalter wachsen. Gleichzeitig planbare Aufträge, Ereignisse/Tag und CPU-Arbeit müssen gemessen werden, damit ein vermeintlicher Speedup nicht nur weniger Geschäft bedeutet.
- 1×1.440, 24×60, 96×15 müssen bei gleicher Startversion und gleichem Zufallszustand denselben fachlichen Zustand erzeugen. Ereignisreihenfolge und Seed explizit vergleichen.
- Historische Suche/erste Listenseite und Dashboard mit begrenzten Antworten; auch sehr alte Daten wirklich öffnen. Finanzdetails centgenau gegen Originaljournal prüfen, auch nach Versetzung, Gehaltsänderung, Verkauf und Storno.
- Prozess/Browser während jedes Commit-Schritts beenden, Quote/Netzwerkfehler, doppelter Befehl, ausbleibende Antwort nach Commit, zwei Geräte und Versionskonflikt injizieren. Keine fehlenden/duplizierten Buchungen und kein voreilig bestätigter Fortschritt.
- Sicherung auf anderem Gerät aus Cloud und vollständigem Export wiederherstellen, Originalanzahlen/Hashes/Beziehungen/Salden vergleichen. Wiederaufbau der Projektionen aus historischen Originalen testen.
- Gesamtspeicher wächst erwartbar mit Historie; aktiver Arbeitssatz, UI-Datenmenge und normaler Sync dürfen dagegen nicht alle vergangenen Jahre enthalten.

## Quellen und Grenzen

Codebefunde sind im oben genannten Commit nachvollziehbar. Die isolierte Filialreproduktion wurde tatsächlich ausgeführt. In dieser Prüfung wurde kein neuer 1.000-Lkw-/10.000-Tage-Dauerlauf ausgeführt und keine zukünftige Laufzeit zugesichert.

- MDN, Browser-Speicherquoten und Eviction: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria — best-effort ist Standard, persist() kann angefragt werden, ist aber kein externes Backup.
- PostgreSQL, Tabellenpartitionierung: https://www.postgresql.org/docs/current/ddl-partitioning.html — Partition Pruning und Grenzen; nicht mit vollständiger Laufzeitunabhängigkeit verwechseln.
- Base44 SDK Entities: https://docs.base44.com/developers/references/sdk/docs/type-aliases/entities — Pagination und Feldauswahl sind dokumentiert. Die für das Zielsystem benötigten Transaktions-/Index-/Jobgarantien müssen separat nachgewiesen werden.
