# Finanzarchiv und historische Auswertungen

Zweiter Architekturbaustein, 20. September 2026. Ausgangsstand `330b0ac`. Keine Veröffentlichung und keine Änderungen an produktiven Spielständen.

## Verhalten
- Journaloriginale älter als 60 Spieltage werden nach erfolgreicher Komprimierung aus dem aktiven Journal in unveränderliche `accountingJournal`-Blöcke übernommen. Ihre Ablage erfolgt über das vorhandene benutzerbezogene Historien-Repository. Cancellable vorausbezahlte Dienstleistungen behalten die benötigten Ursprungsbelege bis zum Ende dieser Abhängigkeit.
- Eine Finanzprojektion hält verdichtete Kontenbewegungen, Zahlungsstromklassen und Filialbeträge vor. Tagessummen beschleunigen ganze Tage; dünn besetzte Zeitpunkte erhalten exakte inklusive Zeitgrenzen und rückdatierte Buchungen. Die Originalbelege bleiben separat und unverändert abrufbar.
- Salden, Bilanz, GuV und Cashflow berücksichtigen aktive und archivierte Buchungen. GuV und Bilanz durchlaufen das Journal nicht länger separat für jedes Konto. Cache-Neuaufbau berücksichtigt das Archiv; eine vollständige Archivierung erzeugt keine zweite Eröffnungsbilanz.
- Die Journalansicht bietet Suche, Konto-/Typfilter, Originaldetails und Seiten zu 50 Einträgen über den gesamten Bestand. Stand und Aktualisierung sind sichtbar; die Seitenfolge verwendet einen festgehaltenen Spielstand. Neue Buchungen erscheinen nach Aktualisierung. Archivierte Originale sind zusätzlich im Historienbrowser verfügbar.
- Neue Transport-, Lohn- und Standortbuchungen halten ihre Filiale fest. Sonstige Buchungen übernehmen explizite Filialangaben bzw. eindeutig aktuelle Fahrzeug-/Personalzuordnung. Rückdatierte Buchungen ohne explizite Angabe werden nicht nachträglich einer heutigen Filiale zugewiesen. Historische Einträge werden nicht umgeschrieben.
- Filialergebnisse entstehen jetzt aus gebuchten Erträgen/Aufwendungen, inklusive Korrekturen und sonstiger Kosten. Verkauf, Personalwechsel oder Fahrtbereinigung verschieben diese Ergebnisse nicht. Nicht belegbare alte Zuordnungen und zentrale Beträge erscheinen als „Nicht zugeordnet / Zentrale“. Geschlossene oder nicht mehr vorhandene Filialen bleiben mit ihren Beträgen sichtbar. Die Summe der Filialergebnisse entspricht bei vollständiger Buchungshistorie der GuV.

## Schnittstellen und Fehlerschutz
`queryJournal(snapshot, {filters,before})` liest aktive und archivierte Originale im Datei-Worker. `before` ist eine exklusive Buchungsnummer; die Antwort enthält höchstens 50 Originale. Der Worker prüft die Sitzung nach Abschluss. Konto-, Typ-, Text-, Zeit-, Auftrags- und Fahrzeugfilter sind in der Abfrage verfügbar.

Die alten synchronen, derzeit sonst ungenutzten Hilfen `getJournal` und `getAccountMovements` können keine ausgelagerten Originale laden. Sie melden deshalb bei einem archivierten Bestand bzw. betroffenen Zeitraum ausdrücklich die notwendige vollständige Abfrage, statt stillschweigend unvollständige Ergebnisse zurückzugeben. Die Journaloberfläche ist auf die neue Abfrage umgestellt.

Archivanzahl und Finanzprojektion müssen zusammenpassen. Eingebettete Belege werden auf Prüfsumme, Länge und Buchungsnummernindex geprüft. Komprimierungs- und Speicherfehler dürfen den bisherigen aktiven Zustand nicht ersetzen. Datei-/Cloud-Sicherungen enthalten Belege und Projektion; keine externe Sicherung besteht nur aus lokalen Verweisen.

## Prüfungen
525 Tests bestanden, ein bestehender Test übersprungen. Build und Lint erfolgreich; bekannte Bundle-Größenwarnungen bleiben. Neue Tests decken Zeitgrenzen, Rückdatierung, Bilanz/GuV/Cashflow, ursprüngliche Belege, Filialwechsel/Verkauf, nicht zuordenbare Altbuchungen, Korrekturen, Seitenfolge mit zurückbehaltenen Belegen, Suchfilter, portable Sicherung, Cache-Neuaufbau, fehlende Archivblöcke und Komprimierungsfehler ab. Kein echter Browser-End-to-End-Test in diesem Schritt.

Reale Spielstandkopie: 97 aktive LKW, sechs Standorte, drei Tagesvorläufe. Skript `bench/financial-archive-replay.cjs`; Zahlen in `replay.json`. Alle 22.957 vorbestehenden Originalbuchungen wurden am Ende exakt wiedergefunden, ohne doppelte Buchungsnummern. Finanzberichte zu mehreren historischen Stichtagen sowie Firma, Privatbereich, Personal, Flotte und gelieferte Aufträge stimmten mit dem vorherigen Code überein. Neue Zuordnungsmetadaten und korrigierte Filialauswertungen unterscheiden sich beabsichtigt.

Beim Laden wurden 4.750 alte Buchungen ausgelagert. Die Finanzprojektion benötigte 236.969 Byte. Der aktive JSON-Zustand sank gegenüber der bereits vorhandenen nichtfinanziellen Archivierung von 25.281.085 auf 22.875.426 Byte (rund 9,5 Prozent zusätzlich). Der rohe ursprüngliche Exportzustand hatte 45.227.555 Byte; die Differenz hierzu stammt auch aus dem vorherigen Architekturbaustein und ist kein alleiniger Effekt dieses Schritts.

| Vorlauf | Vorher, Engine | Neue Engine | Neue Komprimierung zusätzlich |
|---|---:|---:|---:|
| 1 | 5.973 ms | 5.636 ms | 120 ms |
| 2 | 4.191 ms | 3.861 ms | 134 ms |
| 3 | 3.785 ms | 3.885 ms | 177 ms |

Die Ausgangsvariante nutzt die vorherige nichtfinanzielle Bereinigung, aber das vollständige Journal. Einzelne sequenzielle Läufe, keine statistisch abgesicherte Beschleunigung. Browser, IndexedDB, Rendering, Cloud und Netzwerk sind nicht Bestandteil dieser Zeiten. Es folgt daraus keine Garantie für Tagesvorläufe unter 20 Sekunden.

## Weitere Architekturarbeit
Aktives Journal enthält weiterhin bis zu 60 Tage plus benötigte Referenzbelege. Tages-/Zeitpunktprojektionen und Archivverzeichnis wachsen noch mit der Spieldauer; ihre Partitionierung und indizierte historische Abfragen bleiben notwendig. Suchanfragen können mehrere Archivblöcke scannen. Noch offen: persistent arbeitender Simulationsexecutor, begrenzte Arbeitsportionen, Ereignis-/Dispositionsindizes, inkrementeller Cloud-Abgleich und Streaming-Backup. Kein Nachweis für tausende Tage mit mehr als 250 LKW in diesem Schritt.

Der ältere Architekturbericht und dessen Reproduktionsdaten dokumentieren den früheren Filialfehler; das dortige Skript behauptet ausdrücklich den damaligen Fehlerzustand und ist kein Test der neuen Implementierung. Neue Regressionstests stehen in `tests/financial-archive.test.ts`.

Neue Finanzarchive benötigen diesen Code oder eine neuere kompatible Version. Ein Rückwechsel auf älteren Code benötigt auch einen vor der Migration gesicherten Spielstand. Frühere Slots und externe Sicherungen wurden in dieser Arbeit nicht verändert.
