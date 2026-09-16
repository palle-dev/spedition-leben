# FERNWERK — Technische Beschreibung

> Architektur- und Implementationsdokument der Speditions- und Lebenssimulation.

---

## 1. Technologie-Stack

| Schicht | Technologie |
|---|---|
| Frontend | React 18 + Vite (ESM), Tailwind CSS, shadcn/ui, lucide-react |
| Animation | Framer Motion (einheitliches EASE `[0.2, 0.75, 0.2, 1]`) |
| Diagramme | Recharts |
| Karten | MapLibre GL JS (OpenFreeMap) |
| Drag & Drop | @hello-pangea/dnd |
| Daten-Hooks | @tanstack/react-query |
| Backend | Base44-Plattform (BaaS): Auth, Datenbank, Backend-Funktionen, Hosting |
| Sprache | JavaScript (Frontend) + TypeScript (Simulations-Engines) |

---

## 2. Architektur-Übersicht

Die Anwendung folgt einer strengen Trennung in drei Schichten:

```
┌─────────────────────────────────────────────┐
│  Frontend (React)                           │
│  GameShell · Pages · Components · gameContext │
└───────────────────┬─────────────────────────┘
                    │ Befehle (Commands)
                    ▼
┌─────────────────────────────────────────────┐
│  Simulations-Adapter (simulationAdapter.js) │
│  Command-Routing · State-Optimierung        │
└───────────────────┬─────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│  Simulations-Engines (TypeScript, pur)      │
│  simulationEngine · tourEngine · accounting  │
│  marketEngine · trainingEngine · ...        │
└───────────────────┬─────────────────────────┘
                    │ Persistenz
                    ▼
┌─────────────────────────────────────────────┐
│  Speicherung                                │
│  IndexedDB (lokal) · GameState-Entity (Cloud)│
└─────────────────────────────────────────────┘
```

**Trennungsprinzip:** Statische Regeln (`gameRules.ts`), Simulationslogik (`simulationEngine.ts` + Sub-Engines) und Speicherung (`gameRepository` / Backend-Funktionen) sind strikt getrennt. Die Engines enthalten keine Auth- oder Speicherlogik — sie sind reine, deterministische Zustandstransformationen.

---

## 3. Simulations-Engine

### 3.1 Kern: `simulationEngine.ts`

Die `applyCommand(state, command, params)`-Funktion ist der zentrale Einstiegspunkt. Sie:

1. Migriert den Zustand (`migrateState` und alle Sub-Migrationen).
2. Bereinigt Historie (Touren/Aufträge/Termine älter als 30 Tage).
3. Führt den Befehl in einem großen `switch` aus (~100 Befehle).
4. Prüft Erfolge (`checkAchievements`) und Belohnungsansprüche.
5. Gibt `{ state, result }` zurück.

### 3.2 Zeitverarbeitung: `advanceTo`

Die Zeitvorlauf-Funktion ist das Herzstück der Simulation:

- **Ereignisgesteuert:** `earliestEventAfter(state, t, targetMin)` findet das nächste anstehende Ereignis (Phasenende, Termin, Mitternacht, Marktwelle, Dienstintervall …).
- **`processEventsAt(state, m, log)`** verarbeitet alle Ereignisse einer Spielminute in festgelegter Reihenfolge:
  1. Phasenabschlüsse (Fahrt, Pause, Ruhe, Laden, Entladen) → ggf. `completeTrip`
  2. Termine (Einladungen, Gespräche, Freizeit)
  3. Erholung / Wartungsenden
  4. Tour-Folgeeinsätze (`processTours`)
  5. Ereignisgesteuerte Disposition (alle 15 Min)
  6. Angestelltenverarbeitung (alle `SERVICE_INTERVAL_MIN` = 15 Min)
  7. Berichte & Staff-Tasks
  8. Finanzierung, Freistellung, Fahrer-Reisen, Schwangerschaft
  9. Tagesabrechnung (Mitternacht)
  10. Krankheit, Dienstleistungen, Werkstatt
  11. Personalmarkt-Wellen, Ausbildung, Gefahrgut
  12. Monatswechsel (Abschreibung, Periodenabschluss)
  13. Auftragsablauf & Fristüberschreitung
  14. Marktwelle (jede Stunde) & Investment-Tick
  15. Tutorial-Einladung
- **Fortschrittsmeldung:** Alle 250 ms wird `reportProgress(current, total, eventCount)` aufgerufen — der Web-Worker leitet dies an den Haupt-Thread weiter.
- **Sicherheitsgrenze:** `MAX_EVENTS = 5.000.000` gegen Endlosschleifen-Bugs.

### 3.3 Sub-Engines (Modularisierung)

Die `simulationEngine.ts` delegiert an spezialisierte Engines:

| Engine | Verantwortung |
|---|---|
| `tourEngine` | Tourenplanung, Bestätigung, Abbruch, Rückladungen, Vorschläge |
| `driverTimeEngine` | Phasenmodell, Fahrerzeit-Zähler, Pausen/Ruhe |
| `accountingEngine` | Doppelte Buchführung, Belege, offene Posten, Anlagen, Abschreibung, Perioden |
| `marketEngine` | Marktwellen, Kundenprofile, Auftragsgenerierung |
| `dispatcherProcessor` | Disponenten-Planung, `planSingleVehicle`, `triggerDispatcherPlanning` |
| `trainingEngine` | Kurse, Qualifikationen, Ausbildungen, Beförderungen |
| `mailEngine` / `mailIntents` | Postfach, Intent-Erkennung, Staff-Tasks |
| `financingEngine` | Kredite, Leasing, Zinsen, Tilgung |
| `branchEngine` | Filialverwaltung, Verschiebungen, Filial-Statistiken |
| `serviceEngine` | Reinigung, Wartung, Abschlepp, Fremdpersonal |
| `workshopEngine` | Werkstattplätze, Wartungsaufträge, Automatik |
| `personnelMarketEngine` | Bewerberwellen, Stellenanzeigen, Bedarfswellen |
| `satisfactionEngine` | Zufriedenheit, Erholung, Kündigungsrisiken, Gespräche |
| `absenceEngine` | Urlaub, Krankheit, Konflikte, Urlaubskonto |
| `dangerousGoodsEngine` | DG-Klassen, Tankfahrzeuge, Ausrüstung, Inspektionen |
| `investmentEngine` | Wertpapiere, Marktticks, Orders |
| `relationshipEngine` | Beziehung, Heirat, Familienplanung |
| `datingEngine` | Partnersuche, Dates, Partnerschaft |
| `purchaseEngine` | Anschaffungen, Aktivitäten, tägliche Unterhaltung |
| `rewardEngine` | Belohnungen, Kosmetika, Gutscheine |
| `timeControlEngine` | Zeitautomatik, Synchronisation mit Echtzeit |
| `eventLog` / `eventScheduler` | Ereignisprotokoll, nächste-Ereignis-Berechnung |
| `terminationEngine` | Kündigung, Freistellung, Austritt |
| `progressEngine` | Erfolgsprüfung, Zustandsmigration |
| `initialStateEngine` | Neuer Spielstand |
| `mailReports` | Berichte, Einführungen, tägliche Statistik |

### 3.4 Statische Daten: `gameRules.ts`

Enthält alle unveränderlichen Spielwerte: Städte, Koordinaten, Kundenprofile, Rollen, Schichtvorlagen, Konstanten (Preise, Fristen, Budgets) und reine Berechnungsfunktionen (`getDistance`, `fuelCents`, `tollCents`, `computeMarketValue`, `mulberry32`-PRNG).

---

## 4. Frontend-Architektur

### 4.1 Routing (`App.jsx`)

- `AuthProvider` → `QueryClientProvider` → `BrowserRouter` → `AuthenticatedApp`.
- Auth-Routen: `/login`, `/register`, `/forgot-password`, `/reset-password`.
- Geschützte Routen unter `ProtectedRoute` + `GameProvider` + `GameShell` als Layout-Route.
- Jede Seite ist eine eigene Route unter `GameShell`.

### 4.2 Game-Context (`gameContext.jsx`)

Zentrale Zustands- und Aktions-Verwaltung, aufgespalten in zwei Contexts (Trennung verhindert unnötige Re-Render):

- **`GameContext`** (Werte): `state`, `loading`, `busy`, `toast`, `overlay`, `automationEnabled`, `displayGameTime`, `toasts`, `unseenCount`, `backgroundAdvance`, `hasLock`, `autosaveMetas`.
- **`GameActionsContext`** (Aktionen): `send`, `newGame`, `reload`, `enableAutomation`, `pauseAutomation`, `startBackgroundAdvance`, `dismissBackgroundAdvanceResult`, Speicher-/Slot-Aktionen.

**Worker-Integration:** Befehle werden über `executeInWorker` in einem Web-Worker (`simulationWorker.js`) ausgeführt. Der Haupt-Thread bleibt frei. Fortschritts-Callbacks werden während `advanceTime` an den Haupt-Thread gesendet.

**Tagesvorlauf im Hintergrund:** `startBackgroundAdvance(1440)` läuft nicht-blockierend; die UI bleibt nutzbar. `backgroundAdvance` hält `{ active, progress, result }`. Nach Abschluss öffnet sich ein Zusammenfassungs-Modal.

**Persistenz:** Debounced Speicherung (alle 3 s bei Änderung), rotierende Autosaves (alle 60 s, 3 Slots), `beforeunload`-Speicherung, Tab-Schreibsperre über `localStorage`-Lock.

### 4.3 GameShell (`GameShell.jsx`)

Layout-Shell mit: Routing-Ausgabe, Szenenhintergrund (`SceneBackground`), `ShellHeader`, `ShellDock`, Verbindungs-/Aktivitäts-Warnungen, Tutorial, Overlays (EventOverlay, DecisionModal), Modals (MailModal) und Toasts.

### 4.4 Komponenten-Struktur

- **`src/pages/`** — Eine Datei pro Seite (Office, Orders, Dispatch, Fleet, Personnel, Finances, Home, Journal, Achievements, Mail, Investment, Branches, Utilization, Efficiency).
- **`src/components/`** — Fokussierte Komponenten ≤ 50 Zeilen, nach Bereich gruppiert (`dispatch/`, `personnel/`, `finance/`, `mail/`, `branches/`, `home/`, `game/`, `office/`, `orders/`, `investment/`, `achievements/`, `journal/`, `notifications/`, `help/`, `brand/`, `ui/`).
- **`src/lib/`** — Daten-Helfer, Simulations-Adapter, Persistenz, gameContext, gameData.

### 4.5 Design-System

- **Tokens** in `src/index.css` (`:root` + `.dark`), gemappt in `tailwind.config.js`.
- **Dunkle, atmosphärische Palette** (Graphit/Holz), Lime-Akzent, Coral-Warnung.
- **Glas-Panele** (`glass`-Utility mit `backdrop-blur`).
- **Bewegung:** Einheitliches `EASE`-System in `src/lib/motion.js`; `prefers-reduced-motion` wird respektiert.
- **Content-Bilder** über `Image`-Komponente (`@/components/ui/image`) mit responsivem srcset und WebP.

---

## 5. Backend-Funktionen

| Funktion | Zweck |
|---|---|
| `gameCommand` | Serverseitige Befehlsausführung mit atomarer Revisionssicherung (GameState-Entity) |
| `applyCommandRemote` | Remote-Anwendung eines Befehls (z. B. für Automatisierung) |
| `processAutomationTick` | Zeitautomatik-Tick (serverseitig) |
| `saveGameState` | Persistiert den Spielstand in der GameState-Entity |

**GameState-Entity:** Speichert einen Spielstand pro Spieler mit `revision` (optimistische Sperre), `state` (vollständiger Spielzustand), `owner_id`, `last_action_id`, `last_result`, `automation_enabled`. RLS: Besitzer darf nur eigene Spielstände lesen; Create/Update/Delete über Backend-Funktionen.

**Sicherheitskonzept:** Geschäftsregeln werden serverseitig in `gameCommand` validiert; der Client kann nur über die Backend-Funktion schreiben. Direkte Client-Schreibzugriffe benötigen eine zweite authentifizierte Sitzung (RLS).

---

## 6. Web-Worker

`simulationWorker.js` verlagert die Simulations-Engine auf einen separaten CPU-Kern:

- **Protokoll:** `{ id, state, command, params }` → `{ id, data }` (oder `{ id, type: "progress", progress }`).
- **Progress-Hook:** `setProgressHook` / `reportProgress` aus `progressHook.js` erlaubt Live-Fortschrittsmeldungen während `advanceTime`.
- **Vorteil:** Lange Zeitvorläufe (1 Tag = 1440 Min mit Tausenden Ereignissen) blockieren die UI nicht.

---

## 7. Persistenz-Strategie

| Ebene | Medium | Zweck |
|---|---|---|
| Lokal (schnell) | `localStorage` (`LS_STATE`) | Debounced Snapshot alle 3 s |
| Lokal (robust) | IndexedDB | Primärer lokaler Spielstand, Autosaves |
| Cloud | GameState-Entity | Serverseitige Synchronisation, Mehrgerät-Backup |

- **Tab-Lock:** `localStorage`-basierter Lock verhindert gleichzeitige Schreibzugriffe mehrerer Tabs.
- **Rotierende Autosaves:** 3 Slots, alle 60 s bei Änderung.
- **Export/Import:** Spielstand als serialisierter String; manuelle Save-Slots benennbar.

---

## 8. Performance-Optimierungen

- **Inkrementelle Wellen-Disposition:** Statt stündlicher Voll-Disposition plant `planSingleVehicle` nur das gerade frei gewordene Fahrzeug — reduziert CPU-Last massiv.
- **Skip-Cache für Disponenten:** Während Vorläufen wird die Planungs-Schwelle von 10 auf 60 Min angehoben (`_bulkAdvance`); bei Vorläufen ≥ 120 Min zusätzlich 2-Stunden-Skip (`_largeAdvance`).
- **Ereignisgesteuerte Disposition:** Nur alle 15 Min (nicht bei jedem Event), da `suggestTours` O(Fahrzeuge × Fahrer × Aufträge²) ist.
- **Fortschritts-Throttling:** `reportProgress` nur alle 250 ms, nicht pro Event.
- **Historien-Bereinigung:** Abgeschlossene Touren/Aufträge älter als 30 Tage werden entfernt.
- **State-Optimierung:** `simulationAdapter.js` entfernt obsolete Events und begrenzt Legacy-Bookings vor der Ausführung.
- **Getrennte Contexts:** `GameActionsContext` verhindert Re-Render komponenten, die nur Aktionen brauchen.

---

## 9. Datenmodell (Auszug)

Der Spielzustand (`state`) ist ein großes JSON-Objekt mit u. a.:

- `gameTime` (Spielminute), `rngSeed` (deterministischer PRNG), `idCounter`
- `company` (accountCents, name), `private` (accountCents, happiness, stress, relationship, playerName, partnerName, rewards, purchases)
- `vehicles[]`, `drivers[]`, `employees[]`, `branches[]`
- `orders[]`, `trips[]`, `tours[]`
- `accounting` (journal, receipts, openItems, assets, periods)
- `mail` (conversations, drafts)
- `absences`, `serviceContracts`, `workshop`, `personnelMarket`
- `training` (enrollments, apprenticeships, qualifications)
- `investment` (market, depot, orders)
- `events[]`, `achievements[]`, `goals[]`, `milestones[]`
- `timeControl` (Automatik-Status), `tutorial`
- `stats` (totalDeliveries, timelyDeliveries, consecutiveBalanceDays …)

**Geld:** Alle Beträge in Cent (Integer) — verhindert Fließkomma-Artefakte.

---

## 10. Bekannte Einschränkungen

- A10-RLS-Nachweis für direkten Client-Schreibzugriff benötigt zweite authentifizierte Sitzung.
- Karten-Kacheldienst (OpenFreeMap) kann bei hoher Last ausfallen; UI benötigt Fallback.
- Finanzfilter zeigen bei Spielstart (< 7 Tagen) identische Werte über alle Zeiträume — mit erklärendem UI-Hinweis adressiert.
- `advanceTo` kann bei großen Zeit-Sprüngen und großen Flotten Performance-Engpässe aufweisen (durch Optimierungen gemindert).

---

## 11. Build & Veröffentlichung

- **Vite**-Build, ESM-only (kein `require`/`module.exports`).
- Veröffentlichung als Web-App unter `https://logistic-game.base44.app` sowie als native iOS/Android-App aus derselben Codebasis.
- Responsives Design (Mobile + Desktop).