# Typecheck-Bereinigung FRACHTFIEBER

Ausgangszustand: 46 TypeScript-Meldungen in 13 Dateien. Ergebnis: npm run typecheck mit Exitcode 0 und ohne Fehlermeldungen.

## Vollständige Liste nach betroffener Datei

| Datei | Meldungen | Korrektur |
|---|---:|---|
| `src/components/branches/EnergyPanel.jsx` | 1 | Recharts-Tooltip: optionale vom Diagramm gelieferte Props mit TooltipProps beschrieben. |
| `src/components/branches/SiteExpansionCard.jsx` | 7 | Erfolgreiche Ausbauvorschau von Fehlerrückgabe unterscheidbar gemacht; Felder nur im Erfolgsfall lesen. Literaltypen in siteExpansionEngine und konsistenter Rückgabetyp im UI. |
| `src/components/finance/JournalView.jsx` | 2 | filterKey gehört jetzt auch zum Anfangs- und Rücksetzzustand der Journal-Seite. |
| `src/components/game/StaffPhoneDialog.jsx` | 1 | Im gemeinsamen PhoneScreen ist der optionale footer mit null vorbelegt. |
| `src/components/investment/AdvisorMandate.jsx` | 3 | Konfiguration der Eingabefelder als Tupel aus Schlüssel, Text und Zahlen beschrieben. Beschriftung bleibt String; Rechenfaktoren bleiben Zahlen. |
| `src/components/ui/tabs.jsx` | 5 | Props und weitergereichte Ref-Typen aus den Radix-Komponenten übernommen. |
| `src/lib/simulation/branchManagerEngine.ts` | 2 | Schulungsprüfungen erhalten die aktuelle Spielzeit ausdrücklich. Die Zielfunktion nutzte vorher bereits state.gameTime als Fallback; kein belegter Laufzeitfehler. |
| `src/lib/simulation/deliveryRisk.ts` | 6 | Maps für Fahrzeuge, Fahrer und Störungen mit den tatsächlich benötigten Datentypen beschrieben statt unbekannten Werten. |
| `src/lib/simulation/investmentAdvisor.ts` | 4 | Optionalen Nachrichtenschlüssel gekennzeichnet; Beraterkennzeichen als explizite Erweiterung der existierenden Order per Object.assign. Identität der Order bleibt erhalten. |
| `src/lib/simulation/keyAccountEngine.ts` | 2 | Gerundete Erfüllungsquote explizit numerisch statt String/Zahl-Mischtyp. Gleiche Rundung, gleiche Schwellenwerte. |
| `src/pages/Admin.jsx` | 3 | Optionale Formatierungsfunktion und Farbgebung der Statistikzelle mit null vorbelegt. |
| `src/pages/Branches.jsx` | 1 | Optionaler Standortparameter des EnergyPanel mit null vorbelegt; Gesamtübersicht bleibt Standard. |
| `src/pages/Office.jsx` | 9 | Folgemeldungen durch korrekte Typen der gemeinsamen Tabs beseitigt; keine Fehlerunterdrückung in Office. |

## Einzelmeldungen vor der Korrektur

```text
> base44-app@0.0.0 typecheck
> tsc -p ./jsconfig.json

src/components/branches/EnergyPanel.jsx(82,26): error TS2739: Type '{}' is missing the following properties from type '{ active: any; payload: any; label: any; }': active, payload, label
src/components/branches/SiteExpansionCard.jsx(21,74): error TS2339: Property 'costCents' does not exist on type '{ ok: boolean; type: any; branchId: any; branchName: any; costCents: any; buildTimeMin: any; buildTimeDays: number; completionEstimate: any; dailyCostCents: any; effectDescription: any; currentParkingSlots: any; currentWorkshopSlots: any; currentBreakAreaLevel: any; error?: undefined; } | { ...; }'.
  Property 'costCents' does not exist on type '{ ok: boolean; error: any; }'.
src/components/branches/SiteExpansionCard.jsx(69,116): error TS2339: Property 'costCents' does not exist on type '{ ok: boolean; type: any; branchId: any; branchName: any; costCents: any; buildTimeMin: any; buildTimeDays: number; completionEstimate: any; dailyCostCents: any; effectDescription: any; currentParkingSlots: any; currentWorkshopSlots: any; currentBreakAreaLevel: any; error?: undefined; } | { ...; }'.
  Property 'costCents' does not exist on type '{ ok: boolean; error: any; }'.
src/components/branches/SiteExpansionCard.jsx(70,156): error TS2339: Property 'dailyCostCents' does not exist on type '{ ok: boolean; type: any; branchId: any; branchName: any; costCents: any; buildTimeMin: any; buildTimeDays: number; completionEstimate: any; dailyCostCents: any; effectDescription: any; currentParkingSlots: any; currentWorkshopSlots: any; currentBreakAreaLevel: any; error?: undefined; } | { ...; }'.
  Property 'dailyCostCents' does not exist on type '{ ok: boolean; error: any; }'.
src/components/branches/SiteExpansionCard.jsx(71,107): error TS2339: Property 'buildTimeMin' does not exist on type '{ ok: boolean; type: any; branchId: any; branchName: any; costCents: any; buildTimeMin: any; buildTimeDays: number; completionEstimate: any; dailyCostCents: any; effectDescription: any; currentParkingSlots: any; currentWorkshopSlots: any; currentBreakAreaLevel: any; error?: undefined; } | { ...; }'.
  Property 'buildTimeMin' does not exist on type '{ ok: boolean; error: any; }'.
src/components/branches/SiteExpansionCard.jsx(71,160): error TS2339: Property 'completionEstimate' does not exist on type '{ ok: boolean; type: any; branchId: any; branchName: any; costCents: any; buildTimeMin: any; buildTimeDays: number; completionEstimate: any; dailyCostCents: any; effectDescription: any; currentParkingSlots: any; currentWorkshopSlots: any; currentBreakAreaLevel: any; error?: undefined; } | { ...; }'.
  Property 'completionEstimate' does not exist on type '{ ok: boolean; error: any; }'.
src/components/branches/SiteExpansionCard.jsx(72,69): error TS2339: Property 'effectDescription' does not exist on type '{ ok: boolean; type: any; branchId: any; branchName: any; costCents: any; buildTimeMin: any; buildTimeDays: number; completionEstimate: any; dailyCostCents: any; effectDescription: any; currentParkingSlots: any; currentWorkshopSlots: any; currentBreakAreaLevel: any; error?: undefined; } | { ...; }'.
  Property 'effectDescription' does not exist on type '{ ok: boolean; error: any; }'.
src/components/branches/SiteExpansionCard.jsx(73,140): error TS2339: Property 'costCents' does not exist on type '{ ok: boolean; type: any; branchId: any; branchName: any; costCents: any; buildTimeMin: any; buildTimeDays: number; completionEstimate: any; dailyCostCents: any; effectDescription: any; currentParkingSlots: any; currentWorkshopSlots: any; currentBreakAreaLevel: any; error?: undefined; } | { ...; }'.
  Property 'costCents' does not exist on type '{ ok: boolean; error: any; }'.
src/components/finance/JournalView.jsx(99,89): error TS2339: Property 'filterKey' does not exist on type '{ rows: any[]; before: any; }'.
src/components/finance/JournalView.jsx(116,118): error TS2339: Property 'filterKey' does not exist on type '{ rows: any[]; before: any; }'.
src/components/game/StaffPhoneDialog.jsx(29,3): error TS2741: Property 'footer' is missing in type '{ children: Element[]; gameTime: any; conversation: true; closingDisabled: boolean; }' but required in type '{ children: any; gameTime?: number; conversation?: boolean; footer: any; closingDisabled?: boolean; }'.
src/components/investment/AdvisorMandate.jsx(30,395): error TS2322: Type '{ "aria-label": string | number; type: "number"; min: string | number; max: string | number; step: number; value: string | number; onChange: (e: ChangeEvent<HTMLInputElement>) => void; className: string; }' is not assignable to type 'DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>'.
  Type '{ "aria-label": string | number; type: "number"; min: string | number; max: string | number; step: number; value: string | number; onChange: (e: ChangeEvent<HTMLInputElement>) => void; className: string; }' is not assignable to type 'InputHTMLAttributes<HTMLInputElement>'.
    Types of property '"aria-label"' are incompatible.
      Type 'string | number' is not assignable to type 'string'.
        Type 'number' is not assignable to type 'string'.
src/components/investment/AdvisorMandate.jsx(30,528): error TS2363: The right-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/investment/AdvisorMandate.jsx(30,636): error TS2363: The right-hand side of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum type.
src/components/ui/tabs.jsx(8,38): error TS2339: Property 'className' does not exist on type '{}'.
src/components/ui/tabs.jsx(19,41): error TS2339: Property 'className' does not exist on type '{}'.
src/components/ui/tabs.jsx(20,4): error TS2741: Property 'value' is missing in type '{ ref: ForwardedRef<any>; className: string; }' but required in type 'TabsTriggerProps'.
src/components/ui/tabs.jsx(30,41): error TS2339: Property 'className' does not exist on type '{}'.
src/components/ui/tabs.jsx(31,4): error TS2741: Property 'value' is missing in type '{ ref: ForwardedRef<any>; className: string; }' but required in type 'TabsContentProps'.
src/lib/simulation/branchManagerEngine.ts(372,9): error TS2554: Expected 3 arguments, but got 2.
src/lib/simulation/branchManagerEngine.ts(502,9): error TS2554: Expected 3 arguments, but got 2.
src/lib/simulation/deliveryRisk.ts(23,62): error TS2339: Property 'status' does not exist on type 'unknown'.
src/lib/simulation/deliveryRisk.ts(24,62): error TS2339: Property 'sickUntil' does not exist on type 'unknown'.
src/lib/simulation/deliveryRisk.ts(24,114): error TS2339: Property 'attendance' does not exist on type 'unknown'.
src/lib/simulation/deliveryRisk.ts(26,125): error TS2339: Property 'name' does not exist on type 'unknown'.
src/lib/simulation/deliveryRisk.ts(26,163): error TS2339: Property 'portraitId' does not exist on type 'unknown'.
src/lib/simulation/deliveryRisk.ts(36,13): error TS2339: Property 'status' does not exist on type 'unknown'.
src/lib/simulation/investmentAdvisor.ts(31,2): error TS2554: Expected 4 arguments, but got 3.
src/lib/simulation/investmentAdvisor.ts(48,2): error TS2554: Expected 4 arguments, but got 3.
src/lib/simulation/investmentAdvisor.ts(55,2): error TS2554: Expected 4 arguments, but got 3.
src/lib/simulation/investmentAdvisor.ts(120,17): error TS2339: Property 'advisorManaged' does not exist on type '{ id: string; depotId: any; instrumentId: any; side: any; orderType: any; qty: any; filledQty: number; filledGrossCents: number; feeCents: number; limitCents: any; stopCents: any; trailingPercent: any; ... 10 more ...; rejectReason: any; }'.
src/lib/simulation/keyAccountEngine.ts(632,10): error TS2365: Operator '>=' cannot be applied to types 'string | number' and 'number'.
src/lib/simulation/keyAccountEngine.ts(633,10): error TS2365: Operator '>=' cannot be applied to types 'string | number' and 'number'.
src/pages/Admin.jsx(340,30): error TS2739: Type '{ value: any; }' is missing the following properties from type '{ value: any; format: any; tone: any; }': format, tone
src/pages/Admin.jsx(343,30): error TS2739: Type '{ value: any; }' is missing the following properties from type '{ value: any; format: any; tone: any; }': format, tone
src/pages/Admin.jsx(346,30): error TS2739: Type '{ value: any; }' is missing the following properties from type '{ value: any; format: any; tone: any; }': format, tone
src/pages/Branches.jsx(99,61): error TS2741: Property 'branchId' is missing in type '{}' but required in type '{ branchId: any; }'.
src/pages/Office.jsx(34,5): error TS2322: Type '{ children: Element[]; "aria-label": string; className: string; }' is not assignable to type 'IntrinsicAttributes & RefAttributes<any>'.
  Property 'children' does not exist on type 'IntrinsicAttributes & RefAttributes<any>'.
src/pages/Office.jsx(35,6): error TS2322: Type '{ children: string; value: string; className: string; }' is not assignable to type 'IntrinsicAttributes & RefAttributes<any>'.
  Property 'children' does not exist on type 'IntrinsicAttributes & RefAttributes<any>'.
src/pages/Office.jsx(36,6): error TS2322: Type '{ children: string; value: string; className: string; }' is not assignable to type 'IntrinsicAttributes & RefAttributes<any>'.
  Property 'children' does not exist on type 'IntrinsicAttributes & RefAttributes<any>'.
src/pages/Office.jsx(37,6): error TS2322: Type '{ children: string; value: string; className: string; }' is not assignable to type 'IntrinsicAttributes & RefAttributes<any>'.
  Property 'children' does not exist on type 'IntrinsicAttributes & RefAttributes<any>'.
src/pages/Office.jsx(38,6): error TS2322: Type '{ children: string; value: string; className: string; }' is not assignable to type 'IntrinsicAttributes & RefAttributes<any>'.
  Property 'children' does not exist on type 'IntrinsicAttributes & RefAttributes<any>'.
src/pages/Office.jsx(40,5): error TS2322: Type '{ children: Element[]; value: string; className: string; }' is not assignable to type 'IntrinsicAttributes & RefAttributes<any>'.
  Property 'children' does not exist on type 'IntrinsicAttributes & RefAttributes<any>'.
src/pages/Office.jsx(49,5): error TS2322: Type '{ children: Element[]; value: string; className: string; }' is not assignable to type 'IntrinsicAttributes & RefAttributes<any>'.
  Property 'children' does not exist on type 'IntrinsicAttributes & RefAttributes<any>'.
src/pages/Office.jsx(58,5): error TS2322: Type '{ children: Element[]; value: string; className: string; }' is not assignable to type 'IntrinsicAttributes & RefAttributes<any>'.
  Property 'children' does not exist on type 'IntrinsicAttributes & RefAttributes<any>'.
src/pages/Office.jsx(67,5): error TS2322: Type '{ children: Element[]; value: string; className: string; }' is not assignable to type 'IntrinsicAttributes & RefAttributes<any>'.
  Property 'children' does not exist on type 'IntrinsicAttributes & RefAttributes<any>'.
```

## Verifikation

- Vollständiger bestehender Typecheck: Exitcode 0. Prüfungsumfang und Compilerregeln unverändert; keine ts-ignore-/ts-nocheck-Unterdrückung hinzugefügt.
- 121 Tests aus 15 Dateien bestanden; 0 fehlgeschlagen, 0 übersprungen. Vollständige Ergebnisse in tests.json.
- Produktionsbuild npm run build: Exitcode 0. Ein Hinweis auf ältere Browserslist-Daten ist kein Typ- oder Buildfehler; Dependency-Updates sind nicht Teil dieser Änderung.
- ESLint der bearbeiteten JSX-Dateien erfolgreich.
- Alle fünf geänderten Simulationsmodule sind bytegleich mit ihren base44/shared-Kopien.
- Keine Produktionsspielstände verändert. Nicht veröffentlicht. Keine zusätzliche visuelle Browserabnahme behauptet.
