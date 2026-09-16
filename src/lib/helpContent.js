// Zentrale Hilfe-Inhalte für FERNWERK.
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
        heading: 'Was ist FERNWERK?',
        body: 'Du übernimmst eine kleine Hamburger Spedition und führst sie zum Erfolg – während du gleichzeitig dein Privatleben meisterst. Beide Welten beeinflussen sich gegenseitig: Ein vernachlässigtes Privatleben schwächt deine Leistungsfähigkeit als Geschäftsführer, und eine schlecht geführte Firma belastet deine Gesundheit und Beziehungen.',
      },
      {
        heading: 'Die Spielwelt',
        body: 'Du startest mit einer Filiale in Hamburg, drei eigenen Lkw und drei Fahrern. Im Verlauf kannst du weitere Filialen in anderen Städten eröffnen, die Flotte vergrößern (Kauf oder Leasing), Personal einstellen und schulen sowie Privates aufbauen. Alles läuft in einer fortlaufenden Spielzeit – es gibt keine Runden, nur einen kontinuierlichen Kalender.',
      },
      {
        heading: 'Zeitsteuerung',
        body: 'Die Zeit läuft nicht von allein. Über die Steuerung unten rechts treibst du sie voran: „1 Std" springt eine Stunde, „Nächstes Ereignis" läuft bis zur nächsten fälligen Aktion (Fahrtende, Marktwelle, Einladung). „1 Tag" schreibt einen ganzen Tag fort – im Hintergrund werden Touren, Tagesabrechnungen und Ereignisse automatisch abgearbeitet. Ein dezenter Indikator im Dock zeigt laufende Hintergrundberechnungen an.',
      },
      {
        heading: 'Die zwei Konten',
        body: 'Das Firmenkonto (oben links, grün) bezahlt Lkw, Fahrer, Kraftstoff, Maut, Standorte und Wartung. Das Privatkonto (oben, korallenfarben) bezahlt deinen Lebensunterhalt, Anschaffungen und Investments. Über das Geschäftsführergehalt (Finanzen) stellst du ein, wie viel täglich vom Firmen- ins Privatkonto fließt. Zu wenig → privater Existenzdruck; zu viel → Firmenliquidität sinkt.',
      },
      {
        heading: 'Der Spielrhythmus',
        body: 'Aufträge annehmen → disponieren → Zeit fortsetzen → Lieferung erfolgt → Vergütung landet auf dem Firmenkonto → Tagesabrechnung (Mitternacht) zieht Löhne, Standortkosten und Gehalt ab. Zwischendurch: Privatleben-Entscheidungen (Einladungen, Hobbys, Anschaffungen) beachten und auf Zufriedenheit der Mitarbeiter achten.',
      },
      {
        heading: 'Speichern & Spielstände',
        body: 'Über das Festplatten-Symbol oben rechts verwaltest du manuelle Spielstände und Autosaves. Du kannst mehrere Slots anlegen, exportieren (JSON) und importieren. Der Spielstand wird zusätzlich in der Datenbank gesichert, wenn du „Speichern" drückst (erscheint nur, wenn ungespeicherte Änderungen vorliegen).',
      },
      {
        heading: 'Bewegung & Animationen',
        body: 'Über das Funken-Symbol oben rechts schaltest du Animationen ein oder aus. Im reduzierten Modus laufen Übergänge und Effekte schneller oder gar nicht – nützlich auf langsameren Geräten oder wenn du dich auf Zahlen konzentrieren willst.',
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
        body: 'Auf der Seite „Aufträge" siehst du im Tab „Frachtbörse" alle aktuellen Marktangebote mit Start, Ziel, Fracht, Vergütung, Annahme- und Lieferfrist. Neue Angebote erscheinen stündlich in Wellen – die nächste Marktwelle wird oben als Uhrzeit angezeigt. Der Zielbestand an offenen Angeboten richtet sich nach deiner planbaren Flotte.',
      },
      {
        heading: 'Angebotstypen',
        body: 'Standard-Fracht ist die Regel. Express-Aufträge haben kürzere Fristen aber höhere Vergütung. Vorlauf-Aufträge (Advance) sind Vorab-Dispositionen mit längerer Vorlaufzeit. Gefahrgut-Frachten (ADR) erfordern speziell qualifizierte Fahrer und Disponenten, bringen aber mehr Geld.',
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
        heading: 'Filter & Suche',
        body: 'Über den „Filter"-Button (mit Zähler-Badge) klappst du eine Filterleiste auf: Startort, Frachtart, Ausführbarkeit (vom System als passend/schwer ausführbar bewertet), Gefahrgut und Filiale. Suche und Sortierung (Lieferfrist, Annahmefrist, Vergütung) helfen bei großen Listen.',
      },
      {
        heading: 'Zuständige Filiale',
        body: 'Jedem Angebot wird automatisch die nächstgelegene aktive Filiale als zuständig zugeordnet. Mit dem Filial-Filter grenzt du die Börse auf eine bestimmte Filiale ein.',
      },
      {
        heading: 'Eigene Aufträge',
        body: 'Im Tab „Eigene Aufträge" siehst du angenommene und laufende Aufträge mit Status, geplanter Ankunft und Lieferfrist. Abgeschlossene und verfallene Aufträge erscheinen darunter. Angenommene, noch nicht disponierte Aufträge kannst du von hier aus direkt planen oder stornieren.',
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
        body: 'Auf der Seite „Disposition" planst du, welcher Lkw welchen Auftrag fährt. Wähle einen angenommenen Auftrag, einen freien Lkw und einen freien Fahrer. Das System prüft automatisch: Kapazität, Zustand, gemeinsamer Standort, Einsatzgrenze (Arbeitszeit), Gefahrgut-Qualifikation und Kontostand.',
      },
      {
        heading: 'Fahrer & Lkw müssen matchen',
        body: 'Fahrer und Lkw müssen am selben Standort sein. Ist der Fahrer in einer anderen Stadt, muss er erst dorthin (Leerfahrt). Das System schlägt nur gültige Kombinationen vor und sortiert Fahrer nach verbleibender Arbeitszeit, um Überlastung bei standortübergreifenden Anfragen zu vermeiden.',
      },
      {
        heading: 'Touren-Phasen',
        body: 'Eine Tour durchläuft Phasen: Beladung, Fahrt zum Ziel, Entladung und ggf. Rückfahrt. Jede Phase kostet Zeit. Die Fahrer-Arbeitszeit (Lenkzeit) ist gesetzlich begrenzt – das System warnt, wenn eine Tour die Tagesgrenze überschreitet. Rückfracht (ein Folgeauftrag vom Ziel zurück) erhöht die Auslastung.',
      },
      {
        heading: 'Karte & Routen',
        body: 'Die Dispositions-Karte zeigt alle aktiven Touren, Fahrzeugstandorte und Filialen. Du siehst Live-Positionen, geplante Routen und Ankunftszeiten. Klicke auf eine Tour für Details zu Phasen, Fahrer und Ladung.',
      },
      {
        heading: 'Auto-Optimierung',
        body: 'Mit „Auto-Optimieren" lässt du das System automatisch die bestmögliche Zuordnung von Aufträgen, Fahrzeugen und Fahrern berechnen. Es berücksichtigt Auslastung, Fristen und Kosten. Das Ergebnis kannst du vor dem Start prüfen und anpassen.',
      },
      {
        heading: 'Disponent einstellen',
        body: 'Ein Disponent (Personal) kann Touren automatisch planen. Im Modus „Vorschläge" erstellt er Vorschläge, die du bestätigst. Im „autonomen Modus" übernimmt er alles selbst – inklusive Auftragsannahme. Seine Kapazität (Anzahl Lkw) lässt sich durch Schulung erhöhen. Ein Disponent mit Gefahrgut-Dispositions-Schulung darf auch ADR-Aufträge disponieren.',
      },
      {
        heading: 'Gefahrgut',
        body: 'Gefahrgut-Frachten (ADR) erfordern beim Fahrer die ADR-Qualifikation und beim (autonomen) Disponenten die Gefahrgut-Dispositions-Schulung. Ohne diese kann der Auftrag nicht angenommen oder disponiert werden. Gefahrgut-Touren sind besser bezahlt, bergen aber höhere Anforderungen.',
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
        heading: 'Flotte',
        body: 'Im Tab „Flotte" siehst du alle einsatzfähigen Lkw mit Standort, Zustand, Status (frei, unterwegs, Wartung) und Besitzform (eigen/geleast). Jeder Lkw hat 12 t Kapazität und verbraucht ca. 28 L/100 km. Der Buchwert eigener Lkw sinkt mit Alter und Kilometerstand, der Marktwert richtet sich nach Zustand und Alter.',
      },
      {
        heading: 'Lkw kaufen & leasen',
        body: 'Über „Kaufen (30.000 €)" erwirbst du einen neuen eigenen Lkw an der gewählten Filiale. „Leasen (1.500 €)" stellt einen Leasing-Lkw bereit – die monatlichen Leasingraten laufen über die Finanzierung. Vor dem Kauf müssen betriebliche Pflichtkosten beglichen sein. Bei mehreren Filialen wählst du den Zielstandort über die Filial-Auswahl.',
      },
      {
        heading: 'Verkaufen & Verkaufsangebot',
        body: 'Eigene Lkw kannst du verkaufen (Verkaufen-Button auf der Karte) oder zum Verkauf markieren. Markierte Fahrzeuge erhalten ein Händler-Angebot, das eine gewisse Zeit gültig ist – nimmst du an, wird der Erlös auf das Firmenkonto gebucht. Leasing-Fahrzeuge lassen sich nicht verkaufen, ihr Vertrag ist in den Finanzen einsehbar.',
      },
      {
        heading: 'Wartung & Werkstatt',
        body: 'Jeder Lkw hat einen Zustand (0–100). Bei niedrigem Zustand steigt das Pannenrisiko. „Schnellwartung" auf der Karte kostet Geld und Zeit – der Lkw ist währenddessen nicht verfügbar. Im Tab „Werkstatt" planst du Werkstatt-Aufträge detailliert. Ein eigener Mechaniker senkt die Teilekosten und die Dauer; die materialeffiziente Wartung (Schulung) spart zusätzlich 10 % Teilekosten.',
      },
      {
        heading: 'Gefahrgut-Ausstattung',
        body: 'Im Tab „Gefahrgut" rüstest du Lkw für ADR-Transporte nach (ADR-Kit, Beschilderung, Trennwand etc.). Nur ausgerüstete Lkw dürfen Gefahrgut-Frachten laden. Die Umrüstung kostet Geld und bindet das Fahrzeug kurzzeitig.',
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
        body: 'Fahrer bringen Lkw auf Tour. Disponenten planen Touren (manuell oder autonom). Mechaniker warten Lkw und senken Wartungskosten. Buchhalter erledigen die Finanzbuchführung. Reinigungskräfte halten die Flotte sauber. Der Assistent der Geschäftsführung übernimmt Management-Aufgaben. Filialleiter treffen autonome Entscheidungen für ihre Filiale.',
      },
      {
        heading: 'Bewerbermarkt & Einstellung',
        body: 'Im Tab „Bewerber" durchsuchst du den Bewerbermarkt, filterst nach Rolle, Standort und Verfügbarkeit und stellst ein. Jede Einstellung kostet eine einmalige Einstellungsgebühr; danach läuft der Tageslohn. Achte darauf, dass Mechaniker einen Werkstatt-Slot an deiner Filiale brauchen – ohne Werkstatt können sie nicht arbeiten.',
      },
      {
        heading: 'Stellen ausschreiben',
        body: 'Unter „Stellenausschreibungen" veröffentlichst du offene Stellen. Je nach Bedarf und Marktaktivität bewerben sich nach einer Weile passende Kandidaten. Du kannst Stellen auf eine bestimmte Filiale und Rolle begrenzen.',
      },
      {
        heading: 'Team & Verwaltung',
        body: 'Im Tab „Team" siehst du alle Mitarbeiter mit Status, Zufriedenheit, Anwesenheit, Standort, Kosten und aktuellen Einsätzen. Du kannst Mitarbeiter kündigen, versetzen oder befördern. Bei mehreren Filialen filterst du nach Standort.',
      },
      {
        heading: 'Schulung & Beförderung',
        body: 'Mitarbeiter können Kurse buchen: ADR (Gefahrgut), Eco-Drive (Kraftstoffersparnis), erweiterte Disposition, materialeffiziente Wartung u. a. Kurse kosten Gebühren und Zeit – der Mitarbeiter ist währenddessen abwesend. Beförderungskurse erhöhen die Rolle und das Gehalt. Der Assistent kann Schulungen automatisch buchen (Budget konfigurierbar).',
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
        body: 'Im Tab „Abwesenheit" planst du Urlaub und siehst Krankheitsfälle. Urlaub gibt Erholung (senkt Belastung, steigt Zufriedenheit), der Mitarbeiter ist aber nicht verfügbar. Krankheit reduziert die Verfügbarkeit und entsteht häufig bei Überlastung.',
      },
      {
        heading: 'Zufriedenheit & Betriebsklima',
        body: 'Überlastete oder unterbezahlte Mitarbeiter werden unzufrieden und kündigen evtl. oder werden krank. Achte auf das Betriebsklima (Team-Klima-Anzeige), auf faire Auslastung und auf Gehaltsgerechtigkeit. Zufriedene Mitarbeiter bleiben länger und leisten mehr.',
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
        body: 'Die Finanz-Seite öffnet mit der „Übersicht". Du siehst Firmenkonto, Privatkonto, Einnahmen/Ausgaben der Periode, offene Posten und wichtige Kennzahlen. Der Zeitverlauf-Filter im Chart-Header lässt dich zwischen verschiedenen Perioden (Woche, Monat, Quartal) wechseln.',
      },
      {
        heading: 'Einnahmen & Ausgaben',
        body: 'Einnahmen: Liefervergütungen. Ausgaben: Kraftstoff, Maut, Fahrerlöhne, Standortkosten, Wartung, Schulungen, Leasingraten. Die Tagesabrechnung (Mitternacht) zieht Fixkosten ab: Löhne, Standortkosten, Geschäftsführergehalt, Leasingraten.',
      },
      {
        heading: 'Geschäftsführergehalt',
        body: 'Über das Gehalts-Panel stellst du dein tägliches Gehalt ein. Es wandert vom Firmenkonto ins Privatkonto. 0 € stoppt die Übertragung – dann musst du von Erspartem leben. Zu hoch → Firma verliert Liquidität. Eine ausgewogene Einstellung ist zentral für beide Konten.',
      },
      {
        heading: 'Buchhaltung & offene Posten',
        body: 'Ein Buchhalter erledigt die Finanzbuchführung. Ohne Buchhalter häufen sich offene Posten, die manuell bearbeitet werden müssen. Ein Senior-Buchhalter schafft mehr Kapazität. Im Tab „Offene Posten" siehst du fällige Rechnungen und kannst sie freigeben. Der Assistent kann Buchhaltungsaufgaben vorbereiten.',
      },
      {
        heading: 'Journal & Berichte',
        body: 'Im Tab „Journal" siehst du alle Buchungssätze im zeitlichen Verlauf. „Berichte" bietet aggregierte Auswertungen nach Kategorien, Filialen und Perioden – ideal, um Schwachstellen zu erkennen.',
      },
      {
        heading: 'Anlagenverzeichnis',
        body: 'Das Anlagenverzeichnis listet alle Firmenfahrzeuge mit Buchwert, Abschreibung und Marktwert. Hier behältst du den Vermögenswert der Flotte im Blick.',
      },
      {
        heading: 'Kredite & Finanzierung',
        body: 'Bei Liquiditätsengpässen kannst du Kredite aufnehmen (Finanzierung). Kredite haben Zinsen und Laufzeiten; die Rate wird täglich abgebucht. Ein Kredit-Kalkulator zeigt dir vorab die Belastung. Leasing verteilt Lkw-Kosten über die Zeit (Leasingraten). Achte auf Zinsen und Laufzeiten – zu viele Kredite können die Firma in die Verlustzone drücken.',
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
        heading: 'Ziele & Belohnungen',
        body: 'Private Ziele (z. B. „erstes eigenes Auto", „stabile Beziehung") geben dir Meilensteine. Erreichst du sie, winken Belohnungen – oft Zufriedenheits- oder Beziehungsboni. Achte auf die Ziel-Anzeige auf der Zuhause-Seite.',
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
        body: 'Ab einer zweiten Filiale kannst du Filialleiter einstellen. Sie treffen autonome Entscheidungen für ihre Filiale (Einstellungen, Wartung, Disposition), die du als Geschäftsführer im Entscheidungs-Panel freigeben oder ablehnen kannst. So skaliert das Unternehmen, ohne dass du jeden Standort einzeln steuerst.',
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
    id: 'branches',
    title: 'Filialen',
    icon: 'Building2',
    color: 'cyan',
    sections: [
      {
        heading: 'Mehrere Standorte',
        body: 'Unter „Filialen" verwaltest du alle deine Standorte. Jede Filiale hat eigene Kosten (Miete, Personal), Ressourcen (Lkw, Fahrer, Werkstatt-Slots) und einen Markt-Bezirk. Du startest mit Hamburg und kannst weitere Filialen in anderen Städten eröffnen.',
      },
      {
        heading: 'Filiale eröffnen',
        body: 'Über „Filiale eröffnen" wählst du eine Stadt und investierst in einen neuen Standort. Die Eröffnung kostet Geld und Zeit; danach laufen Standortkosten täglich. Jede Filiale erweitert deinen Markt-Bezirk und deine Kapazität.',
      },
      {
        heading: 'Ressourcen versetzen',
        body: 'Du kannst Lkw und Mitarbeiter zwischen Filialen versetzen. Das hilft, Engpässe an einem Standort auszugleichen oder neue Filialen zu besetzen. Die Versetzung kostet je nach Entfernung Zeit (Leerfahrt/Reise).',
      },
      {
        heading: 'Filialplanung & Karte',
        body: 'Die Filial-Karte zeigt alle Standorte mit Auslastung und Status. In der Planungs-Ansicht siehst du, wo sich Aufträge und Ressourcen ballen, und kannst strategisch neue Filialen oder Versetzungen planen.',
      },
      {
        heading: 'Filialleiter',
        body: 'Ab einer zweiten Filiale kannst du Filialleiter einstellen. Sie treffen autonome Entscheidungen für ihre Filiale, die du als Geschäftsführer freigeben oder ablehnen kannst. So skaliert das Unternehmen, ohne dass du jeden Standort einzeln steuerst.',
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
    text: 'Deine zentrale Führungsansicht. Hier siehst du Kennzahlen, Flottenlage, anstehende Entscheidungen und Trends. Alles Weitere erreichst du über die Navigation unten.',
  },
  orders: {
    title: 'Aufträge',
    text: 'Hier siehst du Marktangebote und angenommene Aufträge. Nimm profitable Angebote an und disponiere sie dann unter „Disposition". Achte auf die Lieferfrist.',
  },
  dispatch: {
    title: 'Disposition',
    text: 'Plane, welcher Lkw welchen Auftrag fährt. Wähle Auftrag, Lkw und Fahrer – das System prüft automatisch, ob die Kombination gültig ist. Bestätige die Tour, um sie zu starten.',
  },
  fleet: {
    title: 'Fuhrpark',
    text: 'Verwalte deine Lkw. Wartung hält sie einsatzbereit, Kauf/Verkauf passt die Flottengröße an. Ein niedriger Zustand erhöht das Pannenrisiko.',
  },
  personnel: {
    title: 'Personal',
    text: 'Einstellen, kündigen, schulen. Jede Rolle hat eine Funktion. Achte auf Zufriedenheit und Gesundheit – unzufriedene Mitarbeiter kündigen oder werden krank.',
  },
  finances: {
    title: 'Finanzen',
    text: 'Einnahmen, Ausgaben, Buchhaltung, Kredite. Hier stellst du auch dein Geschäftsführergehalt ein – die tägliche Übertragung vom Firmen- ins Privatkonto.',
  },
  home: {
    title: 'Zuhause',
    text: 'Dein Privatleben. Einladungen und Hobbys beeinflussen Beziehung, Gesundheit und Belastung. Vernachlässige es nicht – es wirkt sich auf deine Geschäftsführung aus.',
  },
  investment: {
    title: 'Investment',
    text: 'Lege Privatkapital an. Aktien bieten Renditechance mit Risiko, das Sparbuch Sicherheit mit niedriger Verzinsung.',
  },
  branches: {
    title: 'Filialen',
    text: 'Verwalte mehrere Standorte. Jede Filiale hat eigene Kosten und Ressourcen. Filialleiter können autonom entscheiden – du gibst frei.',
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