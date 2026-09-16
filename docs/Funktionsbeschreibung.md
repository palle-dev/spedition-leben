# FERNWERK — Funktionsbeschreibung

> Eine atmosphärische Wirtschaftssimulation über Transport, Unternehmertum und das Leben dahinter.

FERNWERK versetzt die Spielerin in die Rolle einer Speditionsinhaberin: Sie führt eine kleine Spedition zum Erfolg und steuert gleichzeitig ihr Privatleben. Beide Welten sind eng verzahnt — betriebliche Entscheidungen wirken auf die private Zufriedenheit, private Ereignisse blockieren oder beflügeln den Betrieb.

---

## 1. Spielziel & Spielwelt

Das Spiel kennt keinen festen Endpunkt, sondern definiert Erfolge und Ziele als fortlaufende Herausforderungen. Die Spielerin baut schrittweise eine Spedition auf: Sie kauft Lkw, stellt Personal ein, nimmt Aufträge an, disponiert Touren und liefert Fracht in ganz Deutschland aus.

**Spielwelt:** 30 deutsche Städte mit realen Koordinaten (Hamburg, Berlin, München, Köln, Frankfurt, Stuttgart …). Entfernungen werden über die Haversine-Formel (Luftlinie × Straßenfaktor 1,2) berechnet. 30 fiktive Kunden mit eigenen Versanddepots und bevorzugten Transportrelationen sorgen für ein realistisches Aufkommen.

**Spielzeit:** Die Zeit läuft in Spielminuten. Ein Spieltag hat 1440 Minuten, ein Spielmonat 30 Tage. Die Spielerin kann die Zeit manuell vorlaufen lassen (1 Stunde oder 1 Tag) oder eine Zeitautomatik aktivieren, die die Spielzeit an die Echtzeit koppelt.

---

## 2. Betriebswirtschaft — Die Spedition

### 2.1 Auftragswesen & Markt

- **Marktwellen:** Jede volle Spielstunde entstehen neue Frachtangebote. Der Markt generiert Aufträge basierend auf Kundenprofilen, deren Depots und bevorzugten Relationen.
- **Auftragsarten:** Normal, Express (höhere Vergütung, kürzere Fristen) und Vorlaufaufträge.
- **Preisbildung:** Grundpreis = 125 € + 2,10 € × km + 6 € × Tonnen, modifiziert durch Express-Faktor und Relationsrabatt.
- **Auftragslebenszyklus:** angeboten → angenommen → unterwegs → geliefert (oder: abgelaufen / storniert / gescheitert bei Fristüberschreitung).
- **Marktpriorität:** Wählbare Strategie (ausgewogen, hohe Marge, wenig Leerfahrten) steuert die automatische Disposition.

### 2.2 Fuhrpark

- **Fahrzeugkauf:** Standard-Lkw (12 t, 28 l/100 km) für 30.000 €.
- **Leasing:** Fahrzeuge können geleast werden; Rückgabe, Abzahlung und vorzeitige Kündigung sind möglich. Leasingrückstände blockieren neue Touren.
- **Wartung & Zustand:** Der Zustand verschlechtert sich pro Fahrt. Ab Zustand < 20 sind Einsätze gesperrt. Wartung kostet 1.500 € (bei hoher Belastung 1.875 €) und dauert 8 Stunden.
- **Werkstatt:** Eigene Werkstattplätze können gebaut werden; ein Werkstattmitarbeiter übernimmt Wartungen automatisiert.
- **Fahrzeugverkauf:** Marktwertberechnung aus Alter, Kilometerstand und Zustand; Händler-Angebot = 90 % des Marktwerts. Fahrzeuge können zum Verkauf vorgemerkt werden.

### 2.3 Personal

Acht Rollen sind von Beginn an einstellbar:

| Rolle | Funktion |
|---|---|
| Fahrer | Führt Touren aus |
| Disponent | Plant und bestätigt Touren automatisch |
| Erfahrener Disponent | Höhere Kapazität, bessere Planung |
| Reinigungskraft | Hält Filialen sauber |
| Werkstattmitarbeiter | Führt Wartungen durch |
| Buchhalter / erfahrene Buchhaltung | Prüft Belege, bereitet Zahlungen vor |
| Assistent der GF | Übernimmt operative Entscheidungen |
| Filialleiter | Führt Filialen weitgehend autonom |

- **Personalmarkt:** Bewerber erscheinen in regelmäßigen Wellen; Stellenanzeigen können geschaltet werden. Bedarfsbezogene Wellen werden bei Einstellung ausgelöst.
- **Zufriedenheit:** Jeder Mitarbeiter hat einen Zufriedenheitswert, der durch Lohn, Belastung, Anerkennung und Arbeitsumfeld beeinflusst wird. Niedrige Zufriedenheit führt zu Kündigungsrisiken.
- **Gespräche:** Bleibegespräche und Gehaltserhöhungen können Kündigungen abwenden.
- **Kündigung:** Mit 7-Tage-Frist; Freistellung nach Trip-Ende möglich.
- **Abwesenheiten:** Urlaub (mit Urlaubskonto), Krankheit (mit Genesung) und Konflikterkennung.
- **Aus- & Weiterbildung:** Kurse verleihen Qualifikationen (Eco-Drive, ADR-Basis/Tank, Materialeffizienz, Mentoring, DG-Disponent), die Effizienz und Fähigkeiten verbessern. Ausbildungen (Lehrlinge) ermöglichen Beförderungen.

### 2.4 Disposition & Touren

- **Tourenketten:** Mehrere Aufträge können zu einer Tour kombiniert werden; Rückladungen reduzieren Leerfahrten.
- **Phasenmodell:** Jede Fahrt besteht aus Phasen (Leerfahrt, Beladen, Beladene Fahrt, Entladen, Pause, Ruhe). Das Fahrerzeitmodell (Arbeitsbudget 480 Min, Lenkzeit 270 Min, Pause 45 Min, Ruhe 720 Min) wird realitätsnah abgebildet.
- **Automatische Disposition:** Disponenten planen im Modus „Vorschläge“, „angenommene Disposition“ oder „autonom". Die Effizienz hängt von der Qualifikation „Effiziente Tourenplanung" ab.
- **Bulk-Disposition:** „Alle jetzt disponieren" plant alle freien Fahrzeuge in einem Schritt.

### 2.5 Finanzen & Buchhaltung

- **Doppelte Buchführung:** Vollständiges Kontenrahmen-Modell mit Sachkonten, Journal, Belegen und offenen Posten.
- **Tagesabrechnung:** Jede Mitternacht werden Löhne, Standortkosten, private Entnahme und Lebenshaltung gebucht.
- **Monatsabschluss:** Abschreibung, Periodenabschluss und Buchhalter-Aufgaben.
- **Finanzierung:** Kredite (mit Tilgung und Zinsen) und Leasingverträge. Kreditlimit wird aus Firmenwert berechnet.
- **Anlagenverzeichnis:** Fahrzeuge werden als Anlagegüter erfasst; Verkauf bucht Gewinn/Verlust.
- **Berichtswesen:** Einnahmen-/Ausgaben-Verlauf, Ausgabenstruktur, GuV, Bilanz und Cashflow.

### 2.6 Filialen

- **Filialeröffnung:** Ab Spieltag 3, bei ausreichendem Kapital (50.000 € Gebühr). Jede Filiale hat eine Stadt und eigene Fahrzeuge/Fahrer.
- **Verwaltung:** Fahrzeuge und Fahrer können zwischen Filialen verschoben werden (Überstellungsfahrten). Disponenten und Mitarbeiter werden Filialen zugeordnet.
- **Filialleiter:** Führen ihre Filiale weitgehend autonom, melden aber größere Entscheidungen zur Freigabe.

### 2.7 Dienstleistungen & Gefahrgut

- **Dienstleistungen:** Reinigung, externe Wartung, Abschleppdienst, Fremdpersonal, externe Buchhaltung, Mietfahrzeuge — buchbar als Einzelauftrag oder wiederkehrend.
- **Gefahrgut (ADR):** Eigene DG-Klassen, Tankfahrzeuge, Ausrüstung, Tankreinigung und Inspektionen. DG-Transporte erfordern qualifizierte Fahrer und geeignete Fahrzeuge.

### 2.8 Investment

- **Wertpapierhandel:** Aktien/ETF mit Marktticks jede Stunde, Kursverlauf, Orders (Market, Limit, Stop).
- **Sparpläne & Staking:** Wiederkehrende Anlagen und passive Erträge.
- **Depot-Übersicht:** Bestände, Performance und Orderhistorie.

---

## 3. Privatleben

### 3.1 Lebensaspekte

- **Beziehung:** Entwicklung mit Partner/in Mara; Einladungen, Geschenke, Heirat, Familienplanung (Schwangerschaft, Geburt).
- **Zufriedenheit & Belastung:** Beeinflusst durch Arbeitserfolge, private Aktivitäten und Erfüllung von Versprechen.
- **Balance:** Wer Zufriedenheit ≥ 70 und Belastung ≤ 40 hält, sammelt aufeinanderfolgende Balance-Tage.

### 3.2 Private Aktivitäten & Anschaffungen

- **Aktivitäten:** Spaziergänge, Hafenbesuche, Kochen, Filmabende — reduzieren Belastung, erhöhen Zufriedenheit.
- **Anschaffungen:** Immobilien, Gegenstände (mit täglicher Unterhaltung und Verkaufsmöglichkeit).
- **Belohnungen:** Erfolge schalten Kosmetika, Gutscheine und Belohnungen frei.

### 3.3 Einladungen & Termine

- **Einladungen:** Mara (oder Freunde) laden zu wiederkehrenden Anlässen. Die Spielerin kann zusagen (kostet 60 €), verschieben (Folgetag) oder absagen (Beziehungsverlust).
- **Blockade:** Während aktiver privater Termine sind operative Aktionen gesperrt.

### 3.4 Dating

- **Partnersuche:** Profile liken/passen, Dates ausmachen, Partnerschaft eingehen oder beenden.

---

## 4. Kommunikation — Postfach

- **Interne Mail:** Vollwertiges Postfach mit Unterhaltungen, Entwürfen, Ordnern (Eingang/Gesendet/Archiv), Suche und Filtern.
- **Intent-Erkennung:** Nachrichten werden semantisch analysiert; operative Freigaben erzeugen Aufgaben für Mitarbeiter.
- **Schnellantworten:** Kontextabhängige Antwortvorschläge.
- **Mitarbeiter-Kommunikation:** Jede Person kann angeschrieben werden; Disponenten melden Vorschläge, Fahrer liefern Lieferberichte.

---

## 5. Ereignisse, Erfolge & Ziele

- **Ereignisprotokoll:** Dauerhaftes Protokoll aller systemischen Ereignisse (Lieferungen, Tourenstarts, Wartungsenden, DG-Lieferungen …) mit „gesehen"-Markierung.
- **Erfolge:** Automatische Prüfung nach jedem Befehl; schalten Belohnungen frei.
- **Ziele:** Bis zu drei Ziele gleichzeitig anheften; vordefinierte Vorlagen.

---

## 6. Automatisierung & Zeitsteuerung

- **Zeitautomatik:** Koppelt die Spielzeit an die Echtzeit; pausiert bei Tab-Wechsel.
- **Assistent & Filialleiter:** Übernehmen operative Entscheidungen in konfigurierbarer Frequenz und Autonomie.
- **Werkstatt-Automatik:** Wartungsprofil steuert automatische Wartungsaufträge.

---

## 7. Benutzeroberfläche

- **GameShell:** Atmosphärische Shell mit cineastischen Hintergrundbildern, Glas-Panelen und einheitlicher Bewegungs-Animation.
- **Navigation:** Primärnavi (Büro, Aufträge, Dispo, Zuhause), Schnellnavi (Fuhrpark, Personal, Finanzen) und „Mehr"-Menü (Filialen, Auslastung, Effizienz, Investment, Postfach, Erfolge, Journal).
- **Zeitsteuerung:** Dauerhaft sichtbar im ShellDock mit Tag/Uhrzeit-Anzeige, 1-Stunde- und 1-Tag-Vorlauf (mit Fortschrittsanzeige).
- **Header:** Marken-Signet, Firmenname, Kontostände (Firma/Privat), Speichern, Save-Slots, Postfach, Hilfe, Bewegungs-Einstellungen, Logout.
- **Modal & Drawer:** Postfach als modales Fenster, Detailansichten als seitliche Drawer.