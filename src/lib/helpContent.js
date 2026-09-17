// Zentrale Hilfe-Inhalte für FRACHTFIEBER.
// Organisiert nach Spielbereichen – genutzt vom HelpPanel und HintBadge.
// Icons müssen in HelpPanel.jsx (ICONS-Map) registriert sein.

export const HELP_TOPICS = [
  {
    id: 'basics',
    title: 'Erste Schritte',
    icon: 'Compass',
    color: 'lime',
    sections: [
      {
        heading: 'Was ist FRACHTFIEBER?',
        body: 'Du übernimmst eine kleine Hamburger Spedition und führst sie zum Erfolg – während du gleichzeitig dein Privatleben meisterst. Beide Welten beeinflussen sich gegenseitig: Ein vernachlässigtes Privatleben schwächt deine Leistungsfähigkeit als Geschäftsführer (höhere Wartungskosten, schlechtere Entscheidungen), und eine schlecht geführte Firma belastet deine Gesundheit und Beziehungen. Kleine Firma. Große Pläne.',
      },
      {
        heading: 'Die Spielwelt',
        body: 'Das Spiel deckt ganz Deutschland mit 30 Städten ab – von Hamburg und Bremen im Norden bis München und Freiburg im Süden, von Köln und Saarbrücken im Westen bis Berlin und Dresden im Osten. Du startest mit einer Filiale in Hamburg, drei eigenen Lkw und drei Fahrern. Im Verlauf kannst du weitere Filialen eröffnen, die Flotte vergrößern (Kauf, Leasing oder Gebrauchtmarkt), Personal einstellen und schulen sowie Privates aufbauen. Alles läuft in einer fortlaufenden Spielzeit – es gibt keine Runden, nur einen kontinuierlichen Kalender.',
      },
      {
        heading: 'Schwierigkeit & Hilfssystem',
        body: 'Beim Spielstart wählst du ein Schwierigkeitsprofil (z. B. Einsteiger, Normal, Experte). Es bestimmt Startkapital, Marktbedingungen und Kosten. Zusätzlich aktivierst du optionale Einstiegshilfen: automatische Wartungsplanung, Vorschlags-Automatik für Touren, Kreditwarnungen u. a. Diese Hilfen lassen sich später in den Einstellungen (Zahnrad-Symbol oben rechts) jederzeit an- oder abschalten. Wähle „Mit Begleitung" für einen geführten Einstieg in 5 Schritten oder „Frei spielen" zum selbstständigen Entdecken.',
      },
      {
        heading: 'Szenarien',
        body: 'Neben dem freien Spiel gibt es Szenarien – vordefinierte Herausforderungen mit eigenen Zielen, Startbedingungen und einem festen Zeitrahmen. Szenarien nutzen separate Speicher-Slots und überschreiben keine regulären Spielstände. Operative Eingriffe in Szenarien werden gezählt und im Büro transparent angezeigt. Ein aktives Szenario zeigt seinen Fortschritt direkt auf der Büro-Seite.',
      },
      {
        heading: 'Zeitsteuerung',
        body: 'Die Zeit läuft nicht von allein. Über die Steuerung unten rechts treibst du sie voran: „1 Std" springt eine Stunde, „Nächstes Ereignis" läuft bis zur nächsten fälligen Aktion (Fahrtende, Marktwelle, Einladung). „1 Tag" schreibt einen ganzen Tag fort – im Hintergrund werden Touren, Tagesabrechnungen und Ereignisse automatisch abgearbeitet, die UI bleibt dabei nutzbar. Ein dezenter Indikator im Dock zeigt laufende Hintergrundberechnungen an.',
      },
      {
        heading: 'Die zwei Konten',
        body: 'Das Firmenkonto (oben, grün) bezahlt Lkw, Fahrer, Kraftstoff, Maut, Standorte und Wartung. Das Privatkonto (oben, korallenfarben) bezahlt deinen Lebensunterhalt, Anschaffungen und Investments. Über das Geschäftsführergehalt (Finanzen) stellst du ein, wie viel täglich vom Firmen- ins Privatkonto fließt. Zu wenig → privater Existenzdruck; zu viel → Firmenliquidität sinkt.',
      },
      {
        heading: 'Der Spielrhythmus',
        body: 'Aufträge annehmen → disponieren → Zeit fortsetzen → Lieferung erfolgt → Vergütung landet auf dem Firmenkonto → Tagesabrechnung (Mitternacht) zieht Löhne, Standortkosten und Gehalt ab. Zwischendurch: Privatleben-Entscheidungen (Einladungen, Hobbys, Anschaffungen) beachten und auf Zufriedenheit der Mitarbeiter achten.',
      },
      {
        heading: 'Speichern, Spielstände & Cloud-Sync',
        body: 'Über das Festplatten-Symbol oben rechts verwaltest du manuelle Spielstände und Autosaves. Du kannst mehrere Slots anlegen, exportieren (JSON) und importieren. Der Spielstand wird zusätzlich in der Datenbank gesichert, wenn du „Speichern" drückst (erscheint nur, wenn ungespeicherte Änderungen vorliegen). Die Cloud-Synchronisation sichert explizite Speicherpunkte – keine stündlichen Ticks. Der Sync-Status (synchronisiert, offline, Konflikt) wird oben rechts transparent angezeigt.',
      },
      {
        heading: 'Bewegung & Animationen',
        body: 'Über das Funken-Symbol oben rechts schaltest du Animationen ein oder aus. Im reduzierten Modus laufen Übergänge und Effekte schneller oder gar nicht – nützlich auf langsameren Geräten oder wenn du dich auf Zahlen konzentrieren willst. Alle Animationen respektieren zudem die System-Einstellung „Bewegung reduzieren".',
      },
    ],
  },
  {
    id: 'orders',
    title: 'Aufträge & Markt',
    icon: 'Package',
    color: 'lime',
    sections: [
      {
        heading: 'Frachtbörse',
        body: 'Auf der Seite „Aufträge" siehst du im Tab „Frachtbörse" alle aktuellen Marktangebote mit Start, Ziel, Fracht, Vergütung, Annahme- und Lieferfrist. Neue Angebote erscheinen stündlich in Wellen – die nächste Marktwelle wird oben als Uhrzeit angezeigt. Der Zielbestand an offenen Angeboten richtet sich nach deiner planbaren Flotte. Die Preise folgen der Formel: Grundpreis + Kilometerpreis + Tonnenpreis, modifiziert durch Kundenbeziehung und Marktlage.',
      },
      {
        heading: 'Angebotstypen',
        body: 'Standard-Fracht ist die Regel. Express-Aufträge haben kürzere Fristen aber höhere Vergütung (×1,25). Vorlauf-Aufträge (Advance) sind Vorab-Dispositionen mit längerer Vorlaufzeit. Gefahrgut-Frachten (ADR) erfordern speziell qualifizierte Fahrer und Disponenten sowie ausgerüstete Lkw, bringen aber mehr Geld.',
      },
      {
        heading: 'Frachtarten & Aufbau-Kategorien',
        body: 'Jede Fracht gehört einer Cargo-Kategorie zu, die bestimmt, welcher Lkw-Aufbau erforderlich oder bevorzugt ist: Kühlfracht erfordert einen Kühlwagen, Flüssigtransporte einen Tankwagen, Schüttgut einen Kipper. Standardfracht, Lebensmittel, Getränke und Baustoffe sind Beispielsweise mit jedem Lkw transportierbar, aber der passende Spezial-Lkw erhält einen Preis-Aufschlag (Bonus). Die benötigte Aufbau-Kategorie wird auf jeder Angebotskarte als Badge angezeigt.',
      },
      {
        heading: 'Kunden & Versanddepots',
        body: 'Aufträge stammen von stabilen fiktiven Unternehmen mit eigenen Versanddepots. Ein Kundendepot muss am Abholort existieren – kein Kunde versendet aus jeder Stadt. Jeder Kunde hat bevorzugte Relationen und Frachtarten. Mit der Zeit kannst du Stammkunden gewinnen und Rahmenverträge abschließen (siehe „Kunden").',
      },
      {
        heading: 'Annahme & Stornierung',
        body: 'Klicke „Annehmen", um einen Auftrag zu übernehmen – du verpflichtest dich zur Lieferung bis zur Deadline. Die Vergütung wird erst bei erfolgreicher Lieferung gezahlt. Stornierung nach Annahme ist möglich, kostet aber eine Gebühr (10 % der Vergütung) und Reputation.',
      },
      {
        heading: 'Massen-Aktionen',
        body: 'In der Frachtbörse kannst du mehrere Angebote gleichzeitig auswählen (Checkbox auf der Karte) und mit „Annehmen & verplanen" in einem Schritt annehmen und sofort disponieren. Das System versucht, freie Fahrzeuge automatisch zuzuordnen. Nicht verplanbare Aufträge bleiben angenommen und müssen manuell disponiert werden.',
      },
      {
        heading: 'Fremdvergabe an Partner',
        body: 'Aufträge, die du nicht selbst fahren kannst oder willst, kannst du an externe Speditionspartner vergeben. Öffne das Partner-Angebot (Icon auf der Angebotskarte oder im Dispositions-Tab „Partner"). Du erhältst Angebote verschiedener Partner mit Preis, Dauer und Deckungsbeitrag. Buchst du einen Partner, übernimmt dieser den Transport – du behältst die Marge. Aktive Partner-Transporte lassen sich jederzeit einsehen und stornieren.',
      },
      {
        heading: 'Filter & Suche',
        body: 'Über den „Filter"-Button (mit Zähler-Badge) klappst du eine Filterleiste auf: Startort, Frachtart, Ausführbarkeit (vom System als passend/schwer ausführbar bewertet), Gefahrgut und Filiale. Suche und Sortierung (Lieferfrist, Annahmefrist, Vergütung) helfen bei großen Listen.',
      },
      {
        heading: 'Zuständige Filiale',
        body: 'Jedem Angebot wird automatisch die nächstgelegene aktive Filiale als zuständig zugeordnet. Mit dem Filial-Filter grenzt du die Börse auf eine bestimmte Filiale ein.',
      },
      {
        heading: 'Eigene & fertige Aufträge',
        body: 'Im Tab „Eigene Aufträge" siehst du angenommene und laufende Aufträge mit Status, geplanter Ankunft und Lieferfrist. Abgeschlossene und verfallene Aufträge erscheinen im Tab „Fertige Aufträge". Angenommene, noch nicht disponierte Aufträge kannst du von hier aus direkt planen, an Partner vergeben oder stornieren.',
      },
      {
        heading: 'Offene Aufträge löschen',
        body: 'Mit „Alle offenen löschen" entfernst du alle Marktangebote und ungesplanten angenommenen Aufträge auf einmal – bereits disponierte Touren bleiben unberührt. Hilfreich, wenn sich die Börse mit unbrauchbaren Angeboten füllt.',
      },
    ],
  },
  {
    id: 'dispatch',
    title: 'Disposition',
    icon: 'Map',
    color: 'lime',
    sections: [
      {
        heading: 'Touren planen',
        body: 'Auf der Seite „Disposition" planst du, welcher Lkw welchen Auftrag fährt. Wähle einen angenommenen Auftrag, einen freien Lkw und einen freien Fahrer. Das System prüft automatisch: Kapazität, Zustand, gemeinsamer Standort, Aufbau-Kompatibilität, Fahrer-Arbeitszeit, Gefahrgut-Qualifikation und Kontostand.',
      },
      {
        heading: 'Aufbau-Kompatibilität',
        body: 'Manche Frachtarten erfordern einen bestimmten Lkw-Aufbau: Kühlfracht braucht einen Kühlwagen, Flüssigtransporte einen Tankwagen, Schüttgut einen Kipper. Das System blockiert unpassende Kombinationen und zeigt den Grund an. In der Auftrags-Liste kannst du nach dem Aufbau eines bestimmten Fahrzeugs filtern – nur passende Frachten werden angezeigt.',
      },
      {
        heading: 'Fahrer & Lkw müssen matchen',
        body: 'Fahrer und Lkw müssen am selben Standort sein. Ist der Fahrer in einer anderen Stadt, muss er erst dorthin (Leerfahrt/Reise). Das System schlägt nur gültige Kombinationen vor und sortiert Fahrer nach verbleibender Arbeitszeit, um Überlastung bei standortübergreifenden Anfragen zu vermeiden.',
      },
      {
        heading: 'Touren-Phasen & Fahrerzeit',
        body: 'Eine Tour durchläuft Phasen: Beladung, Fahrt zum Ziel, Entladung und ggf. Rückfahrt. Jede Phase kostet Zeit. Das einheitliche Fahrerzeitmodell begrenzt Arbeitszeit (480 min zwischen Ruhezeiten) und Lenkzeit (270 min seit qualifizierter Fahrpause). Eine kurze Fahrpause (45 min) setzt die Lenkzeit zurück. Das System warnt, wenn eine Tour die Grenzen überschreitet. Rückfracht (ein Folgeauftrag vom Ziel zurück) erhöht die Auslastung.',
      },
      {
        heading: 'Wochenplanung (FERNWERK)',
        body: 'Die Disposition unterstützt eine visuelle Wochenplanung: Du kannst Touren im Voraus planen, verschieben und neu zuordnen. Die Planungs-Ansicht zeigt alle Ressourcen (Fahrzeuge, Fahrer) auf einer Zeitachse. So siehst du Engpässe und Leerzeiten und kannst die Flotte optimal auslasten.',
      },
      {
        heading: 'Karte & Routen',
        body: 'Die Dispositions-Karte zeigt alle aktiven Touren, Fahrzeugstandorte und Filialen in ganz Deutschland. Du siehst Live-Positionen, geplante Routen und Ankunftszeiten. Klicke auf eine Tour für Details zu Phasen, Fahrer und Ladung.',
      },
      {
        heading: 'Auto-Optimierung',
        body: 'Mit „Auto-Optimieren" lässt du das System automatisch die bestmögliche Zuordnung von Aufträgen, Fahrzeugen und Fahrern berechnen. Es berücksichtigt Auslastung, Fristen, Aufbau-Kompatibilität und Kosten. Das Ergebnis kannst du vor dem Start prüfen und anpassen.',
      },
      {
        heading: 'Disponent einstellen',
        body: 'Ein Disponent (Personal) kann Touren automatisch planen. Im Modus „Vorschläge" erstellt er Vorschläge, die du bestätigst. Im „autonomen Modus" übernimmt er alles selbst – inklusive Auftragsannahme. Seine Kapazität (Anzahl Lkw) lässt sich durch Schulung erhöhen. Ein Disponent mit Gefahrgut-Dispositions-Schulung darf auch ADR-Aufträge disponieren.',
      },
      {
        heading: 'Störungsmanagement',
        body: 'Während einer Tour können Störungen auftreten (Stau, Wetter, Fahrzeugausfall). Aktive Störungen werden automatisch modal angezeigt und im Büro unter „Störungen" sichtbar. Du kannst auf Störungen reagieren – z. B. warten, umleiten oder abbrechen. Das System protokolliert alle Störungen und ihre Auswirkungen.',
      },
      {
        heading: 'Gefahrgut',
        body: 'Gefahrgut-Frachten (ADR) erfordern beim Fahrer die ADR-Qualifikation, beim Lkw die Gefahrgut-Ausstattung und beim (autonomen) Disponenten die Gefahrgut-Dispositions-Schulung. Ohne diese kann der Auftrag nicht angenommen oder disponiert werden. Gefahrgut-Touren sind besser bezahlt, bergen aber höhere Anforderungen.',
      },
    ],
  },
  {
    id: 'fleet',
    title: 'Fuhrpark',
    icon: 'Truck',
    color: 'cyan',
    sections: [
      {
        heading: 'Fahrzeugtypen',
        body: 'Es gibt drei Größenklassen: Der Regional-Lkw (8 t, 18.000 €, 22 L/100 km) ist wendig und sparsam, ideal für regionale Verteilerverkehre. Der Standard-Lkw (12 t, 30.000 €, 28 L/100 km) ist der universelle Allrounder. Der schwere Fernverkehrs-Lkw (24 t, 55.000 €, 35 L/100 km) trägt viel, verbraucht aber auch mehr. Wähle je nach Auftrag, Strecke und Budget.',
      },
      {
        heading: 'Spezialisierte Aufbauten',
        body: 'Jeder Lkw lässt sich mit einem von vier Aufbauten kombinieren: Planen (Standard, universell), Kühlwagen (+15 % Preis, +20 % Wartung, +2 L/100 km – für Kühlfracht), Tankwagen (+20 % Preis, +15 % Wartung, +1 L/100 km – für Flüssigtransporte) und Kipper/Silo (+10 % Preis, +10 % Wartung, +1 L/100 km – für Schüttgut). Beim Kauf oder Leasing wählst du Größe und Aufbau frei. Der Aufbau bestimmt, welche Frachtarten der Lkw transportieren kann (strikt) oder für die er einen Bonus erhält.',
      },
      {
        heading: 'Lkw kaufen & leasen',
        body: 'Über „Kaufen" erwirbst du einen neuen eigenen Lkw an der gewählten Filiale – du wählst Größe (Regional/Standard/Schwer) und Aufbau (Planen/Kühl/Tank/Kipper). „Leasen" stellt einen Leasing-Lkw bereit – die monatlichen Leasingraten laufen über die Finanzierung. Vor dem Kauf müssen betriebliche Pflichtkosten beglichen sein. Bei mehreren Filialen wählst du den Zielstandort über die Filial-Auswahl.',
      },
      {
        heading: 'Gebrauchtmarkt',
        body: 'Im Tab „Gebrauchtmarkt" findest du gebrauchte Lkw mit realistischen Preisen, Kilometerständen und Zustandswerten. Der Kauf ist günstiger als ein Neuwagen, aber ältere Fahrzeuge brauchen eher Wartung. Prüfe Zustand und Kilometerstand vor dem Kauf – ein schlechter Zustand bedeutet höhere Pannenrisiken und niedrigeren Marktwert.',
      },
      {
        heading: 'Verkaufen & Verkaufsangebot',
        body: 'Eigene Lkw kannst du verkaufen (Verkaufen-Button auf der Karte) oder zum Verkauf markieren. Markierte Fahrzeuge erhalten ein Händler-Angebot, das eine gewisse Zeit gültig ist – nimmst du an, wird der Erlös auf das Firmenkonto gebucht. Der Marktwert richtet sich nach Alter, Kilometerstand und Zustand. Leasing-Fahrzeuge lassen sich nicht verkaufen, ihr Vertrag ist in den Finanzen einsehbar.',
      },
      {
        heading: 'Wartung & Werkstatt',
        body: 'Jeder Lkw hat einen Zustand (0–100). Die Wartung ist kilometerbasiert: alle 15.000 km wird eine Wartung fällig. Eine Fortschrittsanzeige auf jeder Fahrzeugkarte zeigt, wann die nächste Wartung ansteht. „Schnellwartung" kostet Geld und Zeit – der Lkw ist währenddessen nicht verfügbar. Im Tab „Werkstatt" planst du Werkstatt-Aufträge detailliert. Ein eigener Mechaniker senkt die Teilekosten und die Dauer; die materialeffiziente Wartung (Schulung) spart zusätzlich 10 % Teilekosten.',
      },
      {
        heading: 'Gefahrgut-Ausstattung',
        body: 'Im Tab „Gefahrgut" rüstest du Lkw für ADR-Transporte nach (ADR-Kit, Beschilderung, Trennwand etc.). Nur ausgerüstete Lkw dürfen Gefahrgut-Frachten laden. Die Umrüstung kostet Geld und bindet das Fahrzeug kurzzeitig.',
      },
      {
        heading: 'Fuhrpark-Analyse',
        body: 'Im Tab „Analyse" siehst du Betriebskosten und Ersatz-Empfehlungen pro Fahrzeug: Lieferungen, Ausgaben, Rentabilität, Leerfahrten-Quote und Tageskilometer. Das System warnt bei niedriger Auslastung (nur wenn das Fahrzeug tatsächlich gefahren ist), bei hohem Alter, schlechtem Zustand oder ablaufendem Leasing-Vertrag. Nutze diese Daten, um zu entscheiden, ob sich ein Fahrzeug noch lohnt oder ersetzt werden sollte.',
      },
      {
        heading: 'Belastung & Wartungskosten',
        body: 'Ist deine private Belastung hoch (≥ 80), steigen die Wartungskosten um 25 %. Achte also auf deinen Stress-Spiegel – er wirkt sich direkt auf die Betriebskosten aus.',
      },
    ],
  },
  {
    id: 'personnel',
    title: 'Personal',
    icon: 'Users',
    color: 'violet',
    sections: [
      {
        heading: 'Rollen',
        body: 'Fahrer bringen Lkw auf Tour. Disponenten planen Touren (manuell oder autonom). Mechaniker warten Lkw und senken Wartungskosten. Buchhalter erledigen die Finanzbuchführung. Reinigungskräfte halten die Flotte sauber. Der Assistent der Geschäftsführung übernimmt Management-Aufgaben. Filialleiter treffen autonome Entscheidungen für ihre Filiale. Alle Rollen sind von Beginn an einstellbar – keine künstliche Freischaltung.',
      },
      {
        heading: 'Bewerbermarkt & Einstellung',
        body: 'Im Tab „Bewerber" durchsuchst du den Bewerbermarkt, filterst nach Rolle, Standort und Verfügbarkeit und stellst ein. Jede Einstellung kostet eine einmalige Einstellungsgebühr; danach läuft der Tageslohn. Achte darauf, dass Mechaniker einen Werkstatt-Slot an deiner Filiale brauchen – ohne Werkstatt können sie nicht arbeiten. Bei mehreren Filialen wählst du den Zielstandort.',
      },
      {
        heading: 'Stellen ausschreiben',
        body: 'Unter „Stellenausschreibungen" veröffentlichst du offene Stellen. Je nach Bedarf und Marktaktivität bewerben sich nach einer Weile passende Kandidaten. Du kannst Stellen auf eine bestimmte Filiale und Rolle begrenzen.',
      },
      {
        heading: 'Team & Verwaltung',
        body: 'Im Tab „Team" siehst du alle Mitarbeiter mit Status, Zufriedenheit, Anwesenheit, Standort, Kosten und aktuellen Einsätzen. Du kannst Mitarbeiter kündigen, versetzen oder befördern. Bei mehreren Filialen filterst du nach Standort. Klicke auf eine Person für Detail-Aktionen: Schulung, Abwesenheit, Versetzung, Kündigung.',
      },
      {
        heading: 'Schulung & Beförderung',
        body: 'Mitarbeiter können Kurse buchen: ADR (Gefahrgut), Eco-Drive (Kraftstoffersparnis), erweiterte Disposition, materialeffiziente Wartung, Gefahrgut-Disposition u. a. Kurse kosten Gebühren und Zeit – der Mitarbeiter ist währenddessen abwesend. Beförderungskurse erhöhen die Rolle und das Gehalt (z. B. Disponent → Erfahrener Disponent). Der Assistent kann Schulungen automatisch buchen (Budget konfigurierbar).',
      },
      {
        heading: 'Qualifikationen',
        body: 'Im Tab „Qualifikationen" siehst du alle erworbenen und verfügbaren Qualifikationen deiner Mitarbeiter. ADR und Gefahrgut-Disposition sind Voraussetzung für entsprechende Aufträge. Eco-Drive senkt den Kraftstoffverbrauch des Fahrers.',
      },
      {
        heading: 'Ausbildung',
        body: 'Im Tab „Ausbildung" kannst du Auszubildende annehmen, die über Zeit zu vollwertigen Mitarbeitern heranwachsen. Sie kosten weniger, sind aber anfangs eingeschränkt einsetzbar.',
      },
      {
        heading: 'Abwesenheit & Urlaub',
        body: 'Im Tab „Abwesenheit" planst du Urlaub und siehst Krankheitsfälle. Urlaub gibt Erholung (senkt Belastung, steigert Zufriedenheit), der Mitarbeiter ist aber nicht verfügbar. Krankheit reduziert die Verfügbarkeit und entsteht häufig bei Überlastung.',
      },
      {
        heading: 'Zufriedenheit & Betriebsklima',
        body: 'Überlastete oder unterbezahlte Mitarbeiter werden unzufrieden und kündigen evtl. oder werden krank. Achte auf das Betriebsklima (Team-Klima-Anzeige), auf faire Auslastung und auf Gehaltsgerechtigkeit. Zufriedene Mitarbeiter bleiben länger und leisten mehr.',
      },
      {
        heading: 'Disponenten-Setup',
        body: 'Für jeden Disponenten konfigurierst du den Modus (Vorschläge oder autonom), die betreuten Lkw und die Schicht. Disponenten arbeiten in Schichten (Früh, Tag, Spät, Nacht) für 24/7-Betrieb. Die Kapazität (Anzahl Lkw pro Disponent) lässt sich durch Schulung erhöhen.',
      },
    ],
  },
  {
    id: 'finances',
    title: 'Finanzen',
    icon: 'Wallet',
    color: 'cyan',
    sections: [
      {
        heading: 'Übersicht',
        body: 'Die Finanz-Seite öffnet mit der „Übersicht". Du siehst Firmenkonto, Privatkonto, Einnahmen/Ausgaben der Periode, offene Posten und wichtige Kennzahlen. Die doppelte Buchführung folgt einem Kontenplan nach SKR mit Abschreibung und Periodenabschluss.',
      },
      {
        heading: 'Liquiditätsvorschau',
        body: 'Im Tab „Liquiditätsvorschau" siehst du eine Prognose der kommenden Ein- und Auszahlungen über die nächsten Tage und Wochen. Geplante Tourerlöse, Leasingraten, Kreditraten, Löhne und Standortkosten werden berücksichtigt. So erkennst du Engpässe frühzeitig und kannst rechtzeitig Kredite aufnehmen oder Aufträge annehmen. Bei prognostizierten Engpässen erscheint eine Warnung im Büro.',
      },
      {
        heading: 'Zeitverlauf',
        body: 'Im Tab „Zeitverlauf" zeigt ein Chart die Entwicklung von Umsatz, Kosten und Gewinn über verschiedene Perioden (Woche, Monat, Quartal). Vergleiche Phasen und erkenne Trends.',
      },
      {
        heading: 'Einnahmen & Ausgaben',
        body: 'Einnahmen: Liefervergütungen. Ausgaben: Kraftstoff, Maut, Fahrerlöhne, Standortkosten, Wartung, Schulungen, Leasingraten, Kreditzinsen. Die Tagesabrechnung (Mitternacht) zieht Fixkosten ab: Löhne, Standortkosten, Geschäftsführergehalt, Leasingraten, Kreditraten.',
      },
      {
        heading: 'Geschäftsführergehalt',
        body: 'Über das Gehalts-Panel stellst du dein tägliches Gehalt ein. Es wandert vom Firmenkonto ins Privatkonto. 0 € stoppt die Übertragung – dann musst du von Erspartem leben. Zu hoch → Firma verliert Liquidität. Eine ausgewogene Einstellung ist zentral für beide Konten.',
      },
      {
        heading: 'Buchhaltung & offene Posten',
        body: 'Ein Buchhalter erledigt die Finanzbuchführung. Ohne Buchhalter häufen sich offene Posten, die manuell bearbeitet werden müssen. Ein Senior-Buchhalter schafft mehr Kapazität. Im Tab „Offene Posten" siehst du fällige Rechnungen und kannst sie freigeben. Der Assistent kann Buchhaltungsaufgaben vorbereiten. Im Tab „Buchhaltung" verwaltest du dein Buchhaltungsteam.',
      },
      {
        heading: 'Journal & Auswertungen',
        body: 'Im Tab „Journal" siehst du alle Buchungssätze im zeitlichen Verlauf. „Auswertungen" bietet aggregierte Auswertungen nach Kategorien, Filialen und Perioden – ideal, um Schwachstellen zu erkennen.',
      },
      {
        heading: 'Anlagenverzeichnis',
        body: 'Das Anlagenverzeichnis (Tab „Anlagen") listet alle Firmenfahrzeuge mit Buchwert, Abschreibung und Marktwert. Hier behältst du den Vermögenswert der Flotte im Blick.',
      },
      {
        heading: 'Kredite & Finanzierung',
        body: 'Bei Liquiditätsengpässen kannst du Kredite aufnehmen (Tab „Finanzierung"). Kredite haben Zinsen und Laufzeiten; die Rate wird täglich abgebucht. Ein Kredit-Kalkulator zeigt dir vorab die Belastung. Leasing verteilt Lkw-Kosten über die Zeit (Leasingraten). Achte auf Zinsen und Laufzeiten – zu viele Kredite können die Firma in die Verlustzone drücken. Bei schweren Rückständen drohen Mahngebühren und Kreditkündigung.',
      },
    ],
  },
  {
    id: 'private',
    title: 'Privatleben',
    icon: 'Home',
    color: 'coral',
    sections: [
      {
        heading: 'Zuhause',
        body: 'Unter „Zuhause" steuerst du dein Privatleben. Einladungen, Hobbys und Anschaffungen beeinflussen Beziehung, Gesundheit, Belastung und Zufriedenheit. Vernachlässigst du das Privatleben, sinkt deine Leistungsfähigkeit als Geschäftsführer – höhere Wartungskosten, schlechtere Entscheidungen.',
      },
      {
        heading: 'Lebensaspekte',
        body: 'Vier Werte bestimmen dein Privatleben: Beziehung, Gesundheit, Belastung (Stress) und Zufriedenheit. Sie werden kaufmännisch gerundet angezeigt. Jede private Aktivität verändert diese Werte – achte auf die Balance.',
      },
      {
        heading: 'Einladungen',
        body: 'Private Einladungen erscheinen regelmäßig im Postfach oder auf der Zuhause-Seite. Du kannst zusagen, verschieben oder absagen. Jede Entscheidung hat Konsequenzen für Beziehung und Belastung. Ignorierst du eine Einladung bis zum Ablauf der Frist, gilt sie als verpasst.',
      },
      {
        heading: 'Aktive Aktivitäten',
        body: 'Nimmst du an einer privaten Aktivität teil, sind operative Aktionen (Aufträge, Disposition) gesperrt, bis die Aktivität endet. Oben erscheint ein entsprechender Hinweis. Plane also Touren vor einer Aktivität oder schiebe sie auf eine ruhigere Zeit.',
      },
      {
        heading: 'Anschaffungen & Besitz',
        body: 'Im Kaufkatalog erwirbst du private Güter (Auto, Wohnung, Hobbys etc.), die deine Lebensqualität und Zufriedenheit steigern. Unter „Besitz" siehst du alles, was du bereits hast. Manche Anschaffungen sind Voraussetzung für bestimmte Aktivitäten.',
      },
      {
        heading: 'Beziehung & Dating',
        body: 'Das Beziehungs-Panel zeigt den Stand deiner Beziehung. Je nach Spielverlauf kannst du neue Kontakte knüpfen (Dating) oder eine bestehende Beziehung pflegen. Eine stabile Beziehung senkt die Belastung und hebt die Zufriedenheit.',
      },
      {
        heading: 'Story & Chronik',
        body: 'Private Geschichten und Ereignisse werden in einer Chronik festgehalten – einer Langzeit-Erinnerung an wichtige Meilensteine in deinem Leben. Personenbasierte Zuordnung von Ereignissen sorgt dafür, dass Beziehungen und Entwicklungen über die Zeit nachvollziehbar bleiben.',
      },
      {
        heading: 'Ziele & Belohnungen',
        body: 'Private Ziele („Entwicklungsziele" genannt) geben dir persönliche Wachstums-Meilensteine. Erreichst du sie, winken Belohnungen – oft Zufriedenheits- oder Beziehungsboni. Achte auf die Ziel-Anzeige auf der Zuhause-Seite.',
      },
    ],
  },
  {
    id: 'customers',
    title: 'Kunden & Verträge',
    icon: 'UserCircle',
    color: 'lime',
    sections: [
      {
        heading: 'Kundenübersicht',
        body: 'Auf der Seite „Kunden" verwaltest du Dauerkundenbeziehungen, Vertrauen und Rahmenverträge. Die Liste zeigt alle Kunden mit Branchenzugehörigkeit, Vertrauenslevel, Versanddepots und bevorzugten Relationen. Stammkunden sind besonders wertvoll – sie bieten stabilere Aufträge und bessere Konditionen.',
      },
      {
        heading: 'Kundendetail',
        body: 'Klickst du einen Kunden an, siehst du sein Profil: Depot-Standorte, bevorzugte Frachtarten, bisherige Lieferungen, Vertrauensentwicklung und ggf. einen aktiven Rahmenvertrag. Du kannst gezielte Akquise betreiben (Kundenansprache), um das Vertrauen zu erhöhen und Stammkunde zu werden.',
      },
      {
        heading: 'Ausschreibungen & Verhandlungen',
        body: 'Über den Reiter „Ausschreibungen" siehst du offene Ausschreibungen, laufende Bewertungen und Verhandlungen aus der gezielten Kundenansprache. Eine Ausschreibung kann zu einem Rahmenvertrag führen, wenn du die beste Bewertung erhältst. Verhandlungen erlauben dir, Konditionen (Preis, Laufzeit, Volumen) zu verhandeln.',
      },
      {
        heading: 'Rahmenverträge',
        body: 'Ein Rahmenvertrag mit einem Kunden sichert dir wiederkehrende Aufträge zu festgelegten Konditionen. Du verpflichtest dich zu einer bestimmten Verfügbarkeit oder Lieferqualität, erhältst dafür planbare Einnahmen und bevorzugte Behandlung. Aktive Verträge werden auf der Kundenseite und im Büro angezeigt.',
      },
      {
        heading: 'Akquise',
        body: 'Die gezielte Kundenansprache (Akquise) erhöht das Vertrauen und die Wahrscheinlichkeit für Stammkunden-Status und Ausschreibungen. Über das Akquise-Panel startest du Maßnahmen (Besuch, Anruf, Angebot). Jede Aktion kostet Zeit und Geld, verbessert aber die Beziehung langfristig.',
      },
      {
        heading: 'Netzkarte-Integration',
        body: 'Kundenbeziehungen lassen sich auch auf der Netzkarte analysieren – dort siehst du, wo deine Kunden sitzen, welche Relationen sie bedienen und wo neue Standorte sinnvoll wären.',
      },
    ],
  },
  {
    id: 'branches',
    title: 'Filialen',
    icon: 'Building2',
    color: 'cyan',
    sections: [
      {
        heading: 'Mehrere Standorte',
        body: 'Unter „Filialen" verwaltest du alle deine Standorte. Jede Filiale hat eigene Kosten (Miete, Personal), Ressourcen (Lkw, Fahrer, Werkstatt-Slots) und einen Markt-Bezirk. Du startest mit Hamburg und kannst weitere Filialen in 30 Städten eröffnen. Jede Filiale erweitert deinen Markt-Bezirk und deine Kapazität.',
      },
      {
        heading: 'Filiale eröffnen',
        body: 'Über „Filiale eröffnen" wählst du eine Stadt und investierst in einen neuen Standort. Die Eröffnung kostet 50.000 € und erfordert ein Mindestspielalter und ausreichend Kapital (Firmenkonto ≥ 2× Gebühr). Danach laufen Standortkosten täglich. Die Filial-Karte zeigt alle Standorte mit Auslastung und Status.',
      },
      {
        heading: 'Ressourcen versetzen',
        body: 'Du kannst Lkw und Mitarbeiter zwischen Filialen versetzen. Das hilft, Engpässe an einem Standort auszugleichen oder neue Filialen zu besetzen. Die Versetzung kostet je nach Entfernung Zeit (Leerfahrt für Lkw, Reise für Fahrer) und Geld (Fahrer-Reisekosten 0,15 €/km).',
      },
      {
        heading: 'Standortausbau',
        body: 'Jede Filiale kann ausgebaut werden – z. B. um zusätzliche Werkstatt-Slots, Lagerfläche oder Bürokapazität. Der Ausbau kostet Geld und Zeit, erhöht aber die Kapazität des Standorts. Nutze den Ausbau, wenn eine Filiale an ihre Grenzen stößt.',
      },
      {
        heading: 'Filialplanung & Karte',
        body: 'Die Filial-Karte zeigt alle Standorte mit Auslastung und Status. In der Planungs-Ansicht siehst du, wo sich Aufträge und Ressourcen ballen, und kannst strategisch neue Filialen oder Versetzungen planen. Die Netzkarte bietet dazu eine detaillierte Standortanalyse.',
      },
      {
        heading: 'Filialleiter & Entscheidungen',
        body: 'Ab einer zweiten Filiale kannst du Filialleiter einstellen. Sie treffen autonome Entscheidungen für ihre Filiale (Einstellungen, Wartung, Disposition), die du als Geschäftsführer im Entscheidungs-Panel freigeben oder ablehnen kannst. So skaliert das Unternehmen, ohne dass du jeden Standort einzeln steuerst.',
      },
    ],
  },
  {
    id: 'network',
    title: 'Netzkarte',
    icon: 'Network',
    color: 'cyan',
    sections: [
      {
        heading: 'Strategische Netzkarte',
        body: 'Die Netzkarte ist deine strategische Planungsansicht über ganz Deutschland. Sie zeigt Filialen, Kunden, aktive Aufträge, laufende Touren und Fahrzeugpositionen auf einer interaktiven Karte. Ebenen lassen sich einzeln ein- und ausblenden (Filialen, Kunden, Aufträge, Touren, Fahrzeuge).',
      },
      {
        heading: 'Relationen',
        body: 'Im Tab „Relationen" siehst du, welche Strecken (von–nach) am häufigsten gefahren werden und wo sich Aufträge ballen. Das hilft dir, zu erkennen, wo eine neue Filiale sinnvoll wäre oder welche Relationen unterversorgt sind.',
      },
      {
        heading: 'Rückladungen',
        body: 'Im Tab „Rückladungen" suchst du nach Folgeaufträgen (Rückfracht) für ein Fahrzeug oder eine Tour. Rückfracht erhöht die Auslastung und vermeidet Leerfahrten. Du kannst nach Fahrzeug, Zielort oder Tour filtern und passende Rückladungen direkt planen.',
      },
      {
        heading: 'Standortanalyse',
        body: 'Im Tab „Standort" analysierst du eine bestimmte Stadt: Wie viele Aufträge gehen von dort aus? Welche Kunden haben dort Depots? Wie ist die Marktlage? Das hilft bei der Entscheidung, ob sich eine neue Filiale lohnt.',
      },
      {
        heading: 'Standortvergleich',
        body: 'Im Tab „Vergleich" vergleichst du bis zu drei Städte nebeneinander: Auftragsvolumen, Entfernungen, bestehende Kundenbeziehungen und Filial-Status. Du kannst direkt eine neue Filiale eröffnen, wenn ein Standort vielversprechend aussieht.',
      },
      {
        heading: 'Filter & Ebenen',
        body: 'Über die Ebenen-Steuerung blendest du Karten-Elemente ein und aus. Filter grenzen die Ansicht auf bestimmte Filialen, Fahrzeuge, Kunden oder Auftrags-Status ein. Klicke auf ein Element in der Karte, um Details zu sehen oder zur entsprechenden Detail-Ansicht zu wechseln.',
      },
    ],
  },
  {
    id: 'leadership',
    title: 'Führung & Delegation',
    icon: 'Shield',
    color: 'violet',
    sections: [
      {
        heading: 'Mitarbeiterbefugnisse',
        body: 'Auf der Seite „Führung" legst du fest, welche Handlungen deine Mitarbeiter selbstständig durchführen dürfen und welche deine Freigabe erfordern. Über Voreinstellungen (z. B. „Strikt", „Ausgewogen", „Autonom") setzt du schnell ein Basis-Niveau, das du dann individuell anpassen kannst.',
      },
      {
        heading: 'Unternehmensweite Regeln',
        body: 'Du definierst: maximale Ausgabe pro Aktion, tägliches Gesamtbudget, Mindestliquidität (Kontopuffer), Freigabe-Modus (bei Freigabe anhalten oder weiterlaufen), automatische Auftragsannahme und automatische Disposition. Diese Regeln gelten unternehmensweit, sofern keine Filial-Überschreibung vorliegt.',
      },
      {
        heading: 'Filial-Überschreibungen',
        body: 'Bei mehreren Filialen kannst du für jede Filiale eigene Regeln festlegen – z. B. ein höheres Budget für eine gut laufende Filiale oder strengere Limits für eine neue. Filial-Überschreibungen lassen sich jederzeit entfernen, um zur Unternehmensregel zurückzukehren.',
      },
      {
        heading: 'Freigaben',
        body: 'Im Tab „Freigaben" siehst du alle ausstehenden Freigabe-Anfragen deiner Mitarbeiter (z. B. eine teure Wartung, eine Einstellung, eine Vertragsänderung). Jede Anfrage zeigt Dringlichkeit, Begründung, Kosten und ggf. Alternativen. Du kannst freigeben oder ablehnen. Im Modus „Weiterlaufen" sammeln sich Freigaben, ohne den Spielverlauf zu blockieren.',
      },
      {
        heading: 'Aktivität & Statistik',
        body: 'Im Tab „Aktivität" siehst du, wie viele Aktionen selbstständig erledigt wurden, wie viele Freigaben anstehen, wie viel delegiert ausgegeben wurde und wie viele Aktionen blockiert wurden. Das Entscheidungs-Log protokolliert die letzten Entscheidungen deiner Mitarbeiter mit Begründung und Kosten.',
      },
    ],
  },
  {
    id: 'business',
    title: 'Geschäftsmodelle',
    icon: 'Briefcase',
    color: 'lime',
    sections: [
      {
        heading: 'Betriebliche Spezialisierung',
        body: 'Auf der Seite „Geschäftsmodelle" wählst du deinen betrieblichen Fokus – eine Spezialisierung, die Auftragsmix, Preise und Kosten beeinflusst. Je nach Fokus erscheinen bestimmte Auftragsarten häufiger oder seltener, und manche Boni werden aktiv. Die Wahl ist nicht endgültig, aber ein Wechsel kostet Zeit und Anpassung.',
      },
      {
        heading: 'Marktlage',
        body: 'Die Marktübersicht zeigt die aktuelle Marktlage: regionale Nachfrage, Saisonalität und aktuelle Ereignisse, die den Markt beeinflussen. Nutze diese Informationen, um zu erkennen, welche Frachtarten gerade gefragt sind und wo sich Engpässe oder Überangebote abzeichnen.',
      },
      {
        heading: 'Segment-Statistiken',
        body: 'Die Segment-Statistiken zeigen, wie sich dein Unternehmen in verschiedenen Segmenten (z. B. Regionalverkehr, Fernverkehr, Express, Gefahrgut, Kühltransporte) entwickelt: Umsatz, Auslastung, Rentabilität pro Segment. So erkennst du, welche Segmente profitabel sind und wo du nachsteuern musst.',
      },
    ],
  },
  {
    id: 'automation',
    title: 'Assistent & Automatisierung',
    icon: 'Sparkles',
    color: 'lime',
    sections: [
      {
        heading: 'Assistent der Geschäftsführung',
        body: 'Stelle einen Assistenten ein (Personal). Er übernimmt automatisch: Tagesberichte, Auftragsannahme, Gemeinkostenoptimierung, Entscheidungsvorschläge, Buchhaltungs-Support, Auftragsüberwachung, Rückstau-Warnungen, Personalentwicklung und Flottenauslastung-Monitoring. Er entlastet dich spürbar im Tagesgeschäft.',
      },
      {
        heading: 'Konfiguration',
        body: 'Im Journal → Assistent-Tab konfigurierst du, welche Funktionen aktiv sind, und setzt Grenzwerte: Mindestmarge für Auto-Annahme, Mindestliquidität, Trainingsbudget, Flottenauslastung-Schwellen etc. Änderungen werden gespeichert und sofort wirksam. Im Assistenten-Log siehst du, was er getan hat.',
      },
      {
        heading: 'Auto-Annahme',
        body: 'Wenn aktiv, nimmt der Assistent profitable Marktangebote automatisch an – sofern Mindestmarge und Mindestliquidität erfüllt sind. Das beschleunigt das Spiel, erfordert aber sorgfältige Grenzwerte, damit er keine Verlust-Aufträge annimmt.',
      },
      {
        heading: 'Disponent & autonomer Modus',
        body: 'Ein Disponent plant Touren. Im autonomen Modus übernimmt er auch die Auftragsannahme und Disposition komplett. Seine Kapazität (Anzahl betreuter Lkw) lässt sich durch Schulung erhöhen. Für Gefahrgut benötigt er die Gefahrgut-Dispositions-Schulung.',
      },
      {
        heading: 'Filialleiter',
        body: 'Ab einer zweiten Filiale kannst du Filialleiter einstellen. Sie treffen autonome Entscheidungen für ihre Filiale (Einstellungen, Wartung, Disposition), die du als Geschäftsführer im Führung-Panel freigeben oder ablehnen kannst. So skaliert das Unternehmen, ohne dass du jeden Standort einzeln steuerst.',
      },
      {
        heading: 'Automations-Tick',
        body: 'Im Hintergrund läuft regelmäßig ein Automations-Tick, der Assistent, Disponent und Filialleiter abarbeitet. Du musst die Zeit dafür fortschreiben – die Automatisation greift erst bei Zeitvorläufen.',
      },
    ],
  },
  {
    id: 'investment',
    title: 'Investment',
    icon: 'LineChart',
    color: 'violet',
    sections: [
      {
        heading: 'Privates Investment',
        body: 'Unter „Investment" kannst du Privatkapital am Markt anlegen. Kurse schwanken – kaufe tief, verkaufe hoch. Alternativ: Festgeld (Sparbuch) mit garantierter, aber niedriger Verzinsung. Das Investment ist Teil deines Privatlebens und wird vom Privatkonto aus finanziert.',
      },
      {
        heading: 'Markt & Depot',
        body: 'Im Markt-Browser siehst du verfügbare Anlageinstrumente mit Kursverlauf. Im Depot siehst du deine Bestände mit aktuellem Wert, Gewinn/Verlust und Anteilen. Klicke auf ein Instrument für einen detaillierten Chart.',
      },
      {
        heading: 'Orders & Orderarten',
        body: 'Du platzierst Kauf- und Verkaufsaufträge. Neben Standard-Orders gibt es erweiterte Orderarten (z. B. Limit-Orders), die zu einem festgelegten Kurs ausgeführt werden. Offene Orders siehst du in der Orders-Tabelle und kannst sie stornieren.',
      },
      {
        heading: 'Sparbuch & Staking',
        body: 'Das Sparbuch bietet feste Verzinsung ohne Kursrisiko – sicher, aber renditeschwach. Staking-Anlagen binden Kapital für eine bestimmte Zeit gegen höhere Rendite. Wähle je nach Liquiditätsbedarf und Risikobereitschaft.',
      },
      {
        heading: 'Risiko & Rendite',
        body: 'Aktien haben höhere Renditechance, aber Kursrisiko. Sparbuch ist sicher, aber Inflation kann den realen Wert mindern. Mische je nach Risikobereitschaft – und behalte immer genug Liquidität auf dem Privatkonto für den Lebensunterhalt.',
      },
    ],
  },
  {
    id: 'mail',
    title: 'Postfach',
    icon: 'Mail',
    color: 'coral',
    sections: [
      {
        heading: 'Postfach',
        body: 'Im Postfach sammeln sich alle Nachrichten: Auftragsbestätigungen, Assistenten-Berichte, Filialleiter-Anfragen, private Einladungen und System-Meldungen. Ungelesene Nachrichten werden oben rechts mit einem Zähler angezeigt.',
      },
      {
        heading: 'Konversationen',
        body: 'Nachrichten sind in Konversationen gegliedert. Du kannst Antworten verfassen (Composer) und so mit Assistent, Filialleitern oder privaten Kontakten kommunizieren. Wichtige Entscheidungen (z. B. Filialleiter-Freigaben) kommen oft per Mail.',
      },
      {
        heading: 'Einladungen & Fristen',
        body: 'Private Einladungen erscheinen ebenfalls im Postfach. Sie haben eine Frist – antworte rechtzeitig mit Zusagen, Verschiebung oder Absage. Verpasste Einladungen wirken sich negativ auf Beziehung und Zufriedenheit aus.',
      },
    ],
  },
  {
    id: 'achievements',
    title: 'Erfolge & Ziele',
    icon: 'Trophy',
    color: 'lime',
    sections: [
      {
        heading: 'Erfolge',
        body: 'Unter „Erfolge" siehst du alle erreichten und offenen Achievements. Sie belohnen Meilensteine wie die erste Filiale, eine bestimmte Flottengröße, lange Spielzeit oder private Ziele. Manche Erfolge geben Boni auf Zufriedenheit oder Reputation.',
      },
      {
        heading: 'Ziele & XP',
        body: 'Der Fortschrittsbalken zeigt deine Erfahrung (XP). Je nach Spielhandlung steigt XP und schaltet neue Erfolge frei. Ziele geben dir Orientierung im Spielverlauf – sie sind nicht zwingend, aber hilfreich, um das Unternehmen strategisch aufzubauen.',
      },
      {
        heading: 'Entwicklungsziele',
        body: 'Persönliche Entwicklungsziele (z. B. „erstes eigenes Auto", „stabile Beziehung", „erste Filiale") geben dir persönliche Wachstums-Meilensteine. Sie werden im Büro und auf der Zuhause-Seite angezeigt und belohnen dich bei Erreichung.',
      },
    ],
  },
  {
    id: 'analytics',
    title: 'Auslastung & Effizienz',
    icon: 'BarChart3',
    color: 'cyan',
    sections: [
      {
        heading: 'Auslastung',
        body: 'Unter „Auslastung" siehst du, wie stark Flotte, Fahrer und Filialen ausgelastet sind. Eine hohe Auslastung bedeutet gute Wirtschaftlichkeit, aber auch höhere Belastung. Eine zu niedrige Auslastung verschwendet Fixkosten. Der Assistent warnt bei Unter- oder Überauslastung.',
      },
      {
        heading: 'Effizienz',
        body: 'Unter „Effizienz" analysierst du Kraftstoffverbrauch, Leerfahrten, Wartungsquote und Kosten pro Kilometer. Eco-Drive-geschulte Fahrer senken den Verbrauch, gute Disposition reduziert Leerfahrten. Nutze diese Seite, um Schwachstellen zu finden und gezielt zu optimieren.',
      },
      {
        heading: 'Kennzahlen lesen',
        body: 'Beide Seiten helfen dir, das Unternehmen datengetrieben zu führen. Vergleiche Perioden, erkenne Trends und leite Maßnahmen ab – z. B. Schulungen bei hohem Verbrauch oder eine neue Filiale bei dauerhaft hoher Auslastung.',
      },
    ],
  },
];

// Kontext-Hinweise für HintBadge auf einzelnen Seiten.
export const PAGE_HINTS = {
  office: {
    title: 'Büro',
    text: 'Deine zentrale Führungsansicht. Hier siehst du Kennzahlen, Flottenlage, anstehende Entscheidungen, Störungen, Kundenbeziehungen und Trends. Alles Weitere erreichst du über die Navigation unten.',
  },
  orders: {
    title: 'Aufträge',
    text: 'Hier siehst du Marktangebote und angenommene Aufträge. Nimm profitable Angebote an und disponiere sie dann unter „Disposition". Achte auf die benötigte Aufbau-Kategorie (Badge auf der Karte) und die Lieferfrist.',
  },
  dispatch: {
    title: 'Disposition',
    text: 'Plane, welcher Lkw welchen Auftrag fährt. Wähle Auftrag, Lkw und Fahrer – das System prüft automatisch Aufbau-Kompatibilität, Kapazität und Fahrerzeit. Bestätige die Tour, um sie zu starten.',
  },
  fleet: {
    title: 'Fuhrpark',
    text: 'Verwalte deine Lkw – drei Größenklassen, vier Aufbauten, Kauf, Leasing oder Gebrauchtmarkt. Wartung ist kilometerbasiert (alle 15.000 km). Ein niedriger Zustand erhöht das Pannenrisiko.',
  },
  personnel: {
    title: 'Personal',
    text: 'Einstellen, kündigen, schulen. Jede Rolle hat eine Funktion. Achte auf Zufriedenheit und Gesundheit – unzufriedene Mitarbeiter kündigen oder werden krank.',
  },
  finances: {
    title: 'Finanzen',
    text: 'Doppelte Buchführung, Liquiditätsvorschau, Kredite und Leasing. Hier stellst du auch dein Geschäftsführergehalt ein – die tägliche Übertragung vom Firmen- ins Privatkonto.',
  },
  home: {
    title: 'Zuhause',
    text: 'Dein Privatleben. Einladungen und Hobbys beeinflussen Beziehung, Gesundheit und Belastung. Vernachlässige es nicht – es wirkt sich auf deine Geschäftsführung aus.',
  },
  customers: {
    title: 'Kunden',
    text: 'Dauerkundenbeziehungen, Vertrauen und Rahmenverträge. Nutze Akquise, um Stammkunden zu gewinnen. Ausschreibungen bieten die Chance auf langfristige Verträge.',
  },
  branches: {
    title: 'Filialen',
    text: 'Verwalte mehrere Standorte in ganz Deutschland. Jede Filiale hat eigene Kosten und Ressourcen. Filialleiter können autonom entscheiden – du gibst frei.',
  },
  network: {
    title: 'Netzkarte',
    text: 'Strategische Planungsansicht: Relationen, Rückladungen, Standortanalyse und Vergleich. Nutze sie, um Leerfahrten zu vermeiden und neue Filialen zu planen.',
  },
  leadership: {
    title: 'Führung',
    text: 'Mitarbeiterbefugnisse festlegen – was selbstständig erlaubt ist und was Freigabe erfordert. Voreinstellungen und Filial-Überschreibungen für feinsteuerung.',
  },
  business: {
    title: 'Geschäftsmodelle',
    text: 'Betriebliche Spezialisierung, Marktlage und Segment-Ergebnisse. Wähle deinen Fokus, um den Auftragsmix zu beeinflussen.',
  },
  investment: {
    title: 'Investment',
    text: 'Lege Privatkapital an. Aktien bieten Renditechance mit Risiko, das Sparbuch Sicherheit mit niedriger Verzinsung.',
  },
  journal: {
    title: 'Journal',
    text: 'Verlauf aller Ereignisse: Lieferungen, Finanzen, Assistenten-Aktivität. Hier konfigurierst du auch den Assistenten der Geschäftsführung.',
  },
  mail: {
    title: 'Postfach',
    text: 'Alle Nachrichten an einem Ort: Auftragsbestätigungen, Assistenten-Berichte, Filialleiter-Anfragen und private Einladungen.',
  },
  achievements: {
    title: 'Erfolge',
    text: 'Deine erreichten und offenen Meilensteine. Erfolge belohnen strategischen Aufbau und geben Orientierung im Spielverlauf.',
  },
  utilization: {
    title: 'Auslastung',
    text: 'Wie stark sind Flotte, Fahrer und Filialen ausgelastet? Hohe Auslastung = gute Wirtschaftlichkeit, aber achte auf Überlastung.',
  },
  efficiency: {
    title: 'Effizienz',
    text: 'Kraftstoffverbrauch, Leerfahrten, Wartungsquote. Nutze diese Kennzahlen, um Schwachstellen zu finden und gezielt zu optimieren.',
  },
};