// Zentrale Hilfe-Inhalte für FERNWERK.
// Organisiert nach Spielbereichen – genutzt vom HelpPanel und HintBadge.

export const HELP_TOPICS = [
  {
    id: 'basics',
    title: 'Erste Schritte',
    icon: 'Compass',
    color: 'lime',
    sections: [
      {
        heading: 'Was ist FERNWERK?',
        body: 'Du übernimmst eine kleine Hamburger Spedition mit drei Lkw und drei Fahrern. Dein Ziel: das Unternehmen profitabel führen und gleichzeitig ein Privatleben meistern – Beides beeinflusst sich gegenseitig.',
      },
      {
        heading: 'Zeitsteuerung',
        body: 'Die Zeit läuft nicht von allein. Nutze „1 Std" oder „Nächstes Ereignis" unten rechts, um die Zeit voranzutreiben. 1 Spielstunde entspricht 1 Echtminute. Fahrten, Tagesabrechnungen und Ereignisse laufen automatisch ab, sobald du die Zeit fortschreibst.',
      },
      {
        heading: 'Die zwei Konten',
        body: 'Das Firmenkonto bezahlt Lkw, Fahrer, Kraftstoff und Maut. Das Privatkonto bezahlt deinen Lebensunterhalt. Über „Geschäftsführergehalt" (in Finanzen) stellst du ein, wie viel täglich vom Firmen- ins Privatkonto fließt. Zu wenig → privater Existenzdruck. Zu viel → Firmenliquidität sinkt.',
      },
      {
        heading: 'Der Spielrhythmus',
        body: 'Aufträge annehmen → disponieren → Zeit fortsetzen → Lieferung erfolgt → Vergütung landet auf dem Firmenkonto → Tagesabrechnung zieht Löhne und Standortkosten ab. Zwischendurch: Privatleben-Entscheidungen (Einladungen, Hobbys) beachten.',
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
        heading: 'Marktangebote',
        body: 'Auf der Seite „Aufträge" siehst du aktuelle Marktangebote mit Start, Ziel, Fracht, Vergütung und Lieferfrist. Jedes Angebot hat eine Annahme-Frist – läuft sie ab, verschwindet das Angebot.',
      },
      {
        heading: 'Auftragsannahme',
        body: 'Klicke auf ein Angebot, um Details zu sehen. „Annehmen" verpflichtet dich zur Lieferung bis zur Deadline. Die Vergütung wird erst bei erfolgreicher Lieferung gezahlt. Stornierung nach Annahme ist möglich, kostet aber Reputation.',
      },
      {
        heading: 'Auto-Annahme',
        body: 'Wenn du einen Assistenten der Geschäftsführung eingestellt hast, kann dieser profitable Angebote automatisch annehmen (konfigurierbar im Journal → Assistent). Die Mindestmarge und Mindestliquidität bestimmst du selbst.',
      },
      {
        heading: 'Lieferfristen',
        body: 'Jeder angenommene Auftrag hat eine Liefer-Deadline. Wird sie verpasst, verfällt die Vergütung. Der Assistent warnt automatisch, wenn eine Frist näher rückt und der Auftrag noch nicht disponiert ist.',
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
        body: 'Auf der Seite „Disposition" planst du, welcher Lkw welchen Auftrag fährt. Wähle einen angenommenen Auftrag, einen freien Lkw und einen freien Fahrer. Das System prüft automatisch: Kapazität, Zustand, gemeinsamer Standort, Einsatzgrenze und Kontostand.',
      },
      {
        heading: 'Fahrer & Lkw müssen matchen',
        body: 'Fahrer und Lkw müssen am selben Standort sein. Ist der Fahrer in einer anderen Stadt, muss er erst dorthin (Leerfahrt). Das System schlägt nur gültige Kombinationen vor.',
      },
      {
        heading: 'Gefahrgut',
        body: 'Einige Frachten sind Gefahrgut. Der Fahrer braucht die ADR-Qualifikation, der Disponent (falls autonom) die Gefahrgut-Dispositions-Schulung. Ohne diese kann der Auftrag nicht angenommen/disponiert werden.',
      },
      {
        heading: 'Disponent einstellen',
        body: 'Ein Disponent kann Touren automatisch planen. Im Modus „Vorschläge" erstellt er Vorschläge, die du bestätigst. Im „autonomen Modus" übernimmt er alles selbst – inklusive Auftragsannahme. Seine Kapazität (Anzahl Lkw) lässt sich durch Schulung erhöhen.',
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
        heading: 'Fahrzeug-Zustände',
        body: 'Jeder Lkw hat einen Zustand (0–100). Bei niedrigem Zustand steigt das Pannenrisiko. Wartung in der Werkstatt stellt den Zustand wieder her. Ein Mechaniker reduziert Wartungskosten und -dauer.',
      },
      {
        heading: 'Lkw kaufen & verkaufen',
        body: 'Auf der Fuhrpark-Seite kannst du neue Lkw kaufen oder gebrauchte vom Markt. Fahrzeuge, die du nicht mehr brauchst, kannst du verkaufen oder zum Verkauf markieren. Leasing ist eine Alternative zum Kauf.',
      },
      {
        heading: 'Wartung & Werkstatt',
        body: 'Wartung kostet Geld und Zeit – der Lkw ist währenddessen nicht verfügbar. Ein eigener Mechaniker senkt die Teilekosten. Die materialeffiziente Wartung (Schulung) spart zusätzlich 10 % Teilekosten.',
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
        body: 'Fahrer bringen Lkw auf Tour. Disponenten planen Touren. Mechaniker warten Lkw. Buchhalter erledigen die Buchhaltung. Reinigungskräfte halten die Flotte sauber. Der Assistent der Geschäftsführung übernimmt Management-Aufgaben.',
      },
      {
        heading: 'Einstellen & Kündigen',
        body: 'Auf der Personal-Seite kannst du Stellen ausschreiben und Bewerber einstellen. Jeder Mitarbeiter kostet Tageslohn. Kündigung ist möglich, erfordert aber eine Frist (außer Probezeit).',
      },
      {
        heading: 'Schulung & Beförderung',
        body: 'Mitarbeiter können Kurse buchen (ADR, Eco-Drive, erweiterte Disposition etc.). Kurse kosten Gebühren und Zeit (Mitarbeiter ist währenddessen abwesend). Beförderungskurse erhöhen die Rolle und das Gehalt. Der Assistent kann Schulungen automatisch buchen.',
      },
      {
        heading: 'Zufriedenheit & Gesundheit',
        body: 'Überlastete oder unterbezahlte Mitarbeiter werden unzufrieden und kündigen evtl. Krankheit reduziert die Verfügbarkeit. Urlaub gibt Erholung. Achte auf das Betriebsklima.',
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
        heading: 'Einnahmen & Ausgaben',
        body: 'Einnahmen: Liefervergütungen. Ausgaben: Kraftstoff, Maut, Fahrerlöhne, Standortkosten, Wartung, Schulungen. Die Tagesabrechnung (Mitternacht) zieht Fixkosten ab: Löhne, Standortkosten, Geschäftsführergehalt.',
      },
      {
        heading: 'Geschäftsführergehalt',
        body: 'In den Finanzen stellst du dein tägliches Gehalt ein. Es wandert vom Firmenkonto ins Privatkonto. 0 € stoppt die Übertragung – dann musst du von Erspartem leben. Zu hoch → Firma verliert Liquidität.',
      },
      {
        heading: 'Buchhaltung',
        body: 'Ein Buchhalter erledigt die Finanzbuchführung. Ohne Buchhalter häufen sich offene Posten, die manuell bearbeitet werden müssen. Ein Senior-Buchhalter schafft mehr Kapazität. Der Assistent kann Buchhaltungsaufgaben vorbereiten.',
      },
      {
        heading: 'Kredite & Leasing',
        body: 'Bei Liquiditätsengpässen kannst du Kredite aufnehmen (Finanzen → Finanzierung). Leasing verteilt Lkw-Kosten über die Zeit. Achte auf Zinsen und Laufzeiten.',
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
        body: 'Unter „Zuhause" steuerst du dein Privatleben. Einladungen, Hobbys und Anschaffungen beeinflussen Beziehung, Gesundheit, Belastung und Zufriedenheit. Vernachlässigst du das Privatleben, sinkt deine Leistungsfähigkeit als Geschäftsführer.',
      },
      {
        heading: 'Einladungen',
        body: 'Private Einladungen erscheinen regelmäßig. Du kannst zusagen, verschieben oder absagen. Jede Entscheidung hat Konsequenzen. Ignorierst du eine Einladung bis zum Ablauf der Frist, gilt sie als verpasst.',
      },
      {
        heading: 'Aktive Aktivitäten',
        body: 'Nimmst du an einer privaten Aktivität teil, sind operative Aktionen (Aufträge, Disposition) gesperrt, bis die Aktivität endet. Oben erscheint ein entsprechender Hinweis.',
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
        body: 'Stelle einen Assistenten ein (Personal). Er übernimmt automatisch: Tagesberichte, Auftragsannahme, Gemeinkostenoptimierung, Entscheidungsvorschläge, Buchhaltungs-Support, Auftragsüberwachung, Rückstau-Warnungen, Personalentwicklung und Flottenauslastung-Monitoring.',
      },
      {
        heading: 'Konfiguration',
        body: 'Im Journal → Assistent-Tab konfigurierst du, welche Funktionen aktiv sind und setzt Grenzwerte (Mindestmarge, Trainingsbudget, Flottenauslastung etc.). Änderungen werden gespeichert und sofort wirksam.',
      },
      {
        heading: 'Filialleiter',
        body: 'Ab einer zweiten Filiale kannst du Filialleiter einstellen. Sie treffen autonome Entscheidungen für ihre Filiale, die du als Geschäftsführer freigeben oder ablehnen kannst.',
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
        body: 'Unter „Investment" kannst du Privatkapital am Markt anlegen. Kurse schwanken. Kaufe tief, verkaufe hoch. Alternativ: Festgeld (Sparbuch) mit garantierter, aber niedriger Verzinsung.',
      },
      {
        heading: 'Risiko & Rendite',
        body: 'Aktien haben höhere Renditechance, aber Kursrisiko. Sparbuch ist sicher, aber Inflation kann realen Wert mindern. Mische je nach Risikobereitschaft.',
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
};