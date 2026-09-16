// Szenario-Katalog für FERNWERK.
// Definiert die drei spielbaren Szenarien mit Ausgangslage, Zielen und Voraussetzungen.
// Zielbedingungen werden beim Start in den Spielstand kopiert und sind
// unveränderlich — eine spätere Überarbeitung der Vorlage beeinflusst
// laufende Partien nicht.

export const SCENARIO_VERSION = 1;

export const SCENARIOS = [
  // ─────────────────────────────────────────────────────────────
  // Szenario 1: Wieder auf Kurs
  // ─────────────────────────────────────────────────────────────
  {
    id: "wieder_auf_kurs",
    title: "Wieder auf Kurs",
    version: SCENARIO_VERSION,
    rngSeed: 77101,
    difficulty: "Mittel",
    durationDays: 30,
    story:
      "Du übernimmst eine kleine Spedition, die ihre Möglichkeiten zuletzt überschätzt hat. " +
      "Fahrzeuge sind vorhanden, doch Wartungen stehen an und laufende Verpflichtungen drücken auf die Kasse. " +
      "Du hast einen Spielmonat, um wieder einen tragfähigen Betrieb aufzubauen.",
    startSummary:
      "3 Lkw (unterschiedliche Zustände), 3 Fahrer, ein bestehender Kredit mit erster Rate am Tag 15, " +
      "begrenzte Liquidität. Ein Lkw ist fast nicht mehr einsatzbereit.",
    startEquipment:
      "3 Lkw (Zustand 75/45/22), 3 Fahrer, 18.000 € Firmenbank, " +
      "Bestehender Kredit 35.000 € (24 Monate, erste Rate Tag 15 ≈ 1.590 €)",
    obligations:
      "Kreditrate am Tag 15, tägliche Fixkosten ca. 500 € (Fahrer, Filiale, Entnahme), " +
      "ein Lkw mit Zustand 22 droht auszufallen",
    mandatoryGoals: [
      {
        id: "no_overdue_financing",
        label: "Keine überfälligen Kredit- oder Leasingverpflichtungen am Stichtag",
        type: "no_overdue_financing",
        target: 0,
        unit: "überfällige Posten",
      },
      {
        id: "min_liquidity",
        label: "Mindestliquidität von 5.000 € am Stichtag",
        type: "liquidity",
        target: 500000,
        unit: "€",
        displayTarget: "5.000 €",
      },
      {
        id: "min_deliveries",
        label: "Mindestens 10 erfolgreiche Lieferungen",
        type: "total_deliveries",
        target: 10,
        unit: "Lieferungen",
      },
      {
        id: "operational_capability",
        label: "Mindestens 2 einsatzbereite Lkw (Zustand ≥ 20) am Stichtag",
        type: "operational_vehicles",
        target: 2,
        unit: "Lkw",
      },
    ],
    optionalGoals: [
      {
        id: "no_new_debt",
        label: "Keine neue Kreditaufnahme während des Szenarios",
        type: "no_new_debt",
      },
      {
        id: "vehicle_sold",
        label: "Mindestens einen Lkw verkauft",
        type: "vehicle_sold",
      },
    ],
    prerequisites: [],
  },

  // ─────────────────────────────────────────────────────────────
  // Szenario 2: Ein Kunde zählt auf dich
  // ─────────────────────────────────────────────────────────────
  {
    id: "ein_kunde_zaehlt_auf_dich",
    title: "Ein Kunde zählt auf dich",
    version: SCENARIO_VERSION,
    rngSeed: 77202,
    difficulty: "Leicht",
    durationDays: 10,
    story:
      "Ein wichtiger Kunde gibt deiner Spedition eine Chance. " +
      "Eine Woche lang sollst du einen festen Transportbedarf zuverlässig abwickeln. " +
      "Gleichzeitig läuft dein bisheriges Geschäft weiter.",
    startSummary:
      "3 Lkw, 3 Fahrer, 1 Disponent, ein vorbereiteter Rahmenvertrag mit 7 Leistungstagen " +
      "(2 Transporte/Tag = 14 gesamt), weitere normale Aufträge. " +
      "Vertragsbeginn Tag 2, Vertragsende Tag 8, Szenarioende Tag 10.",
    startEquipment:
      "3 Lkw (Zustand 80), 3 Fahrer, 1 Disponent (autonom), 25.000 € Firmenbank, " +
      "Rahmenvertrag: Hanse Handelskontor, Hamburg → Bremen, Stückgut 8 t, 2 Transporte/Tag",
    obligations:
      "Rahmenvertrag mit 14 Transporten (Tag 2–8). " +
      "Mindestens 13 pünktliche Lieferungen erforderlich (90% von 14).",
    mandatoryGoals: [
      {
        id: "contract_fulfillment",
        label: "Mindestens 90% der vereinbarten Transporte pünktlich (≥ 13 von 14)",
        type: "contract_fulfillment",
        target: 13,
        totalTransports: 14,
        unit: "pünktliche Lieferungen",
      },
      {
        id: "contract_completed",
        label: "Vertrag regulär abschließen (nicht vorzeitig beendet)",
        type: "contract_completed",
      },
      {
        id: "min_liquidity",
        label: "Mindestliquidität von 15.000 € am Stichtag",
        type: "liquidity",
        target: 1500000,
        unit: "€",
        displayTarget: "15.000 €",
      },
    ],
    optionalGoals: [
      {
        id: "full_fulfillment",
        label: "Alle 14 Transporte pünktlich (100%)",
        type: "contract_full_fulfillment",
        target: 14,
      },
    ],
    prerequisites: [],
  },

  // ─────────────────────────────────────────────────────────────
  // Szenario 3: Der Betrieb läuft auch ohne dich
  // ─────────────────────────────────────────────────────────────
  {
    id: "der_betrieb_laeuft_auch_ohne_dich",
    title: "Der Betrieb läuft auch ohne dich",
    version: SCENARIO_VERSION,
    rngSeed: 77303,
    difficulty: "Schwer",
    durationDays: 7,
    story:
      "Dein Unternehmen ist gewachsen. Jetzt möchtest du zwei Tage freihaben, " +
      "ohne ständig selbst disponieren oder Routineprobleme lösen zu müssen. " +
      "Die Vorbereitung entscheidet, ob daraus eine echte Auszeit wird.",
    startSummary:
      "4 Lkw, 4 Fahrer, 1 Disponent (autonom), private Auszeit an Tag 4–5 (2 Tage). " +
      "Ausreichend Vorbereitungszeit an Tag 1–3. Betrieb muss während der Auszeit weiterlaufen.",
    startEquipment:
      "4 Lkw (Zustand 75), 4 Fahrer, 1 Disponent (autonom), 30.000 € Firmenbank, " +
      "private Auszeit Tag 4–5",
    obligations:
      "Private Auszeit Tag 4–5 (2 Spieltage). " +
      "Während der Auszeit: max. 3 operative Eingriffe, min. 5 Lieferungen. " +
      "Keine überfälligen Freigaben am Ende.",
    mandatoryGoals: [
      {
        id: "timeoff_completed",
        label: "Private Auszeit vollständig abschließen",
        type: "timeoff_completed",
      },
      {
        id: "deliveries_during_timeoff",
        label: "Mindestens 5 erfolgreiche Lieferungen während der Auszeit",
        type: "deliveries_during_timeoff",
        target: 5,
        unit: "Lieferungen",
      },
      {
        id: "max_interventions",
        label: "Höchstens 3 operative Eingriffe während der Auszeit",
        type: "max_interventions",
        target: 3,
        unit: "Eingriffe",
      },
      {
        id: "no_overdue_approvals",
        label: "Keine überfällige Freigabe am Stichtag",
        type: "no_overdue_approvals",
      },
      {
        id: "min_liquidity",
        label: "Mindestliquidität von 20.000 € am Stichtag",
        type: "liquidity",
        target: 2000000,
        unit: "€",
        displayTarget: "20.000 €",
      },
    ],
    optionalGoals: [
      {
        id: "zero_interventions",
        label: "Gar keine operativen Eingriffe während der Auszeit",
        type: "zero_interventions",
      },
    ],
    prerequisites: [],
  },
];

export function getScenarioById(id) {
  return SCENARIOS.find(s => s.id === id) || null;
}