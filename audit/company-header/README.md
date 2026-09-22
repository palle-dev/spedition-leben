# Unternehmensauftritt: visuelle Reduktion

Anlass: Die schematische Hofillustration passt laut Nutzer nicht zum modernen Stil des Spiels. Entscheidung: Illustration, fahrende Miniatur-Lkw und wiederholte Flottenkennzahlen vollständig entfernen. Keine zweite dekorative Hauptansicht.

## Neuer Aufbau

- Firmenidentität und bisheriger OfficeHeader bilden einen gemeinsamen kompakten Kopf.
- Ein Firmenname als h1, optionaler gespeicherter Leitsatz, kleiner Akzent in der gewählten Firmenfarbe.
- Tatsächlicher aktiver Hauptsitz statt festem Hamburg-Text. Zahl aktiver Standorte mit Verweis auf Filialen.
- Spielzeit, Zeitraumfilter und Verbindungs-/Liveanzeige bleiben verfügbar.
- Vorhandene Betriebskacheln und wichtige Aufgaben folgen direkt nach der Tab-Navigation.
- Gestaltung nur bei Bedarf aufklappen; beschriftete Farbauswahl, Formular, Zeichenanzahl, verständlicher Fehlerzustand. Sperre während laufender Speicherung verhindert doppelte Befehle.
- Bestehende Spiel-Farbtokens, einheitliche Rundungen, kleinere Schriftgrößen und mobile Umbrüche. Keine dauerhafte Animation und keine externen Bildassets.
- Gespeicherte Firmenfarbe und Leitsatz bleiben unverändert nutzbar. Keine Simulations- oder Produktionsdatenänderung.

## Prüfung

Vollständiger Typecheck, gezielter ESLint und Produktionsbuild erfolgreich. 21 bestehende Tests aus journey-ui, office-navigation-loading und player-journey erfolgreich. Keine tatsächliche Browser-/Screenshot-Abnahme: Es steht keine Browserfähigkeit bereit. Die angehängte Nutzerdarstellung diente als visuelle Referenz für die Entfernung der alten Szene.

Nicht veröffentlicht; Vorschau über Base44.
