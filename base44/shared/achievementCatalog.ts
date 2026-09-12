// Statischer Erfolgs- und Fortschrittskatalog für FERNWERK.
// Alle XP, Schwellen und Kategorien sind zentral konfigurierbare Spielwerte.
// Trennung: achievementCatalog (statische Definitionen) · progressEngine (Berechnung).

export const ACHIEVEMENT_CATEGORIES = [
  { id: "unternehmen", label: "Unternehmen" },
  { id: "zuverlaessigkeit", label: "Zuverlässigkeit" },
  { id: "privatleben", label: "Privatleben" },
  { id: "besitz", label: "Besitz" },
];

// --- Erfolgsdefinitionen (30 Erfolge, stabil IDs) ---
// condition(state, computed) → boolean
// progress(state, computed) → { current, target }
// computed = { companyValue, privateNetWorth } in Cent

export const ACHIEVEMENTS = [
  // --- Unternehmen ---
  { id: "biz_first", title: "Erste Lieferung", desc: "1 tatsächlich gelieferter Auftrag", category: "unternehmen", xp: 100,
    condition: (s) => (s.stats?.totalDeliveries || 0) >= 1,
    progress: (s) => ({ current: Math.min(s.stats?.totalDeliveries || 0, 1), target: 1 }) },
  { id: "biz_ten_on_time", title: "Wort gehalten", desc: "10 rechtzeitige Lieferungen insgesamt", category: "unternehmen", xp: 200,
    condition: (s) => (s.stats?.timelyDeliveries || 0) >= 10,
    progress: (s) => ({ current: Math.min(s.stats?.timelyDeliveries || 0, 10), target: 10 }) },
  { id: "biz_fifty", title: "Die Räder drehen sich", desc: "50 gelieferte Aufträge", category: "unternehmen", xp: 400,
    condition: (s) => (s.stats?.totalDeliveries || 0) >= 50,
    progress: (s) => ({ current: Math.min(s.stats?.totalDeliveries || 0, 50), target: 50 }) },
  { id: "biz_hundred", title: "Hundert Wege", desc: "100 gelieferte Aufträge", category: "unternehmen", xp: 700,
    condition: (s) => (s.stats?.totalDeliveries || 0) >= 100,
    progress: (s) => ({ current: Math.min(s.stats?.totalDeliveries || 0, 100), target: 100 }) },
  { id: "fleet_four", title: "Verstärkung", desc: "4 eigene Lkw gleichzeitig", category: "unternehmen", xp: 150,
    condition: (s) => (s.vehicles || []).length >= 4,
    progress: (s) => ({ current: Math.min((s.vehicles || []).length, 4), target: 4 }) },
  { id: "fleet_ten", title: "Eigene Flotte", desc: "10 eigene Lkw gleichzeitig", category: "unternehmen", xp: 300,
    condition: (s) => (s.vehicles || []).length >= 10,
    progress: (s) => ({ current: Math.min((s.vehicles || []).length, 10), target: 10 }) },
  { id: "fleet_twentyfive", title: "Große Verantwortung", desc: "25 eigene Lkw gleichzeitig", category: "unternehmen", xp: 600,
    condition: (s) => (s.vehicles || []).length >= 25,
    progress: (s) => ({ current: Math.min((s.vehicles || []).length, 25), target: 25 }) },
  { id: "revenue_100k", title: "Sechsstellig", desc: "100.000 € kumulierte Transportvergütungen", category: "unternehmen", xp: 250,
    condition: (s) => (s.stats?.totalRevenueCents || 0) >= 10000000,
    progress: (s) => ({ current: Math.min(s.stats?.totalRevenueCents || 0, 10000000), target: 10000000 }) },
  { id: "company_1m", title: "Die erste Million", desc: "1 Mio. € Unternehmensvermögenswert", category: "unternehmen", xp: 500,
    condition: (s, c) => c.companyValue >= 100000000,
    progress: (s, c) => ({ current: Math.min(c.companyValue, 100000000), target: 100000000 }) },
  { id: "company_5m", title: "Ein Lebenswerk wächst", desc: "5 Mio. € Unternehmensvermögenswert", category: "unternehmen", xp: 800,
    condition: (s, c) => c.companyValue >= 500000000,
    progress: (s, c) => ({ current: Math.min(c.companyValue, 500000000), target: 500000000 }) },

  // --- Zuverlässigkeit ---
  { id: "reliable_ten", title: "Verlässlich", desc: "10 aufeinanderfolgende rechtzeitige Lieferungen", category: "zuverlaessigkeit", xp: 250,
    condition: (s) => (s.stats?.consecutiveTimely || 0) >= 10,
    progress: (s) => ({ current: Math.min(s.stats?.consecutiveTimely || 0, 10), target: 10 }) },
  { id: "maintain_three", title: "Gut gepflegt", desc: "3 verschiedene eigene Lkw mit abgeschlossener Wartung", category: "zuverlaessigkeit", xp: 150,
    condition: (s) => (s.stats?.maintainedVehicleIds || []).length >= 3,
    progress: (s) => ({ current: Math.min((s.stats?.maintainedVehicleIds || []).length, 3), target: 3 }) },

  // --- Privatleben ---
  { id: "life_first", title: "Feierabend", desc: "1 freiwillige Aktivität abgeschlossen", category: "privatleben", xp: 100,
    condition: (s) => (s.stats?.leisureCount || 0) >= 1,
    progress: (s) => ({ current: Math.min(s.stats?.leisureCount || 0, 1), target: 1 }) },
  { id: "life_five_types", title: "Mehr als Arbeit", desc: "5 verschiedene freiwillige Aktivitätstypen abgeschlossen", category: "privatleben", xp: 200,
    condition: (s) => (s.stats?.leisureTypes || []).length >= 5,
    progress: (s) => ({ current: Math.min((s.stats?.leisureTypes || []).length, 5), target: 5 }) },
  { id: "life_twenty", title: "Zeit für mich", desc: "20 freiwillige Aktivitäten abgeschlossen", category: "privatleben", xp: 300,
    condition: (s) => (s.stats?.leisureCount || 0) >= 20,
    progress: (s) => ({ current: Math.min(s.stats?.leisureCount || 0, 20), target: 20 }) },
  { id: "promise_three", title: "Ich bin da", desc: "3 zuvor zugesagte persönliche Termine eingehalten", category: "privatleben", xp: 150,
    condition: (s) => (s.stats?.promisesKept || 0) >= 3,
    progress: (s) => ({ current: Math.min(s.stats?.promisesKept || 0, 3), target: 3 }) },
  { id: "promise_ten", title: "Darauf ist Verlass", desc: "10 zuvor zugesagte persönliche Termine eingehalten", category: "privatleben", xp: 300,
    condition: (s) => (s.stats?.promisesKept || 0) >= 10,
    progress: (s) => ({ current: Math.min(s.stats?.promisesKept || 0, 10), target: 10 }) },
  { id: "balance_seven", title: "Im Gleichgewicht", desc: "7 aufeinanderfolgende Tagesabschlüsse mit Zufriedenheit ≥70 und Belastung ≤40", category: "privatleben", xp: 350,
    condition: (s) => (s.stats?.consecutiveBalanceDays || 0) >= 7,
    progress: (s) => ({ current: Math.min(s.stats?.consecutiveBalanceDays || 0, 7), target: 7 }) },
  { id: "friendship_70", title: "Gute Gesellschaft", desc: "Eine Freundschaft durch Aktivitäten auf ≥70 entwickeln", category: "privatleben", xp: 200,
    condition: (s) => Object.values(s.stats?.friendshipQualities || {}).some(q => q >= 70),
    progress: (s) => ({ current: Math.min(Math.max(0, ...Object.values(s.stats?.friendshipQualities || {})), 70), target: 70 }) },
  { id: "hobby_five", title: "Dranbleiben", desc: "5 absolvierte Aktivitäten desselben Hobbytyps", category: "privatleben", xp: 150,
    condition: (s) => Object.values(s.stats?.hobbyCounts || {}).some(n => n >= 5),
    progress: (s) => ({ current: Math.min(Math.max(0, ...Object.values(s.stats?.hobbyCounts || {})), 5), target: 5 }) },
  { id: "experience_trip", title: "Rauskommen", desc: "Eine gebuchte mehrtägige Reise abgeschlossen", category: "privatleben", xp: 200,
    condition: (s) => (s.stats?.tripsCompleted || 0) >= 1,
    progress: (s) => ({ current: Math.min(s.stats?.tripsCompleted || 0, 1), target: 1 }) },

  // --- Besitz ---
  { id: "purchase_first", title: "Mein erstes Stück Freiheit", desc: "Erster abgeschlossener Kauf eines privaten dauerhaften Gegenstands", category: "besitz", xp: 100,
    condition: (s) => (s.stats?.ownershipCount || 0) >= 1,
    progress: (s) => ({ current: Math.min(s.stats?.ownershipCount || 0, 1), target: 1 }) },
  { id: "home_three", title: "Angekommen", desc: "3 verschiedene Ausstattungsarten gleichzeitig zuhause eingerichtet", category: "besitz", xp: 200,
    condition: (s) => (s.stats?.homeFurnishingTypes || []).length >= 3,
    progress: (s) => ({ current: Math.min((s.stats?.homeFurnishingTypes || []).length, 3), target: 3 }) },
  { id: "home_owner", title: "Eigener Schlüssel", desc: "Erste gekaufte, bezogene Hauptwohnung/Haus", category: "besitz", xp: 350,
    condition: (s) => s.stats?.hasHome === true,
    progress: (s) => ({ current: s.stats?.hasHome ? 1 : 0, target: 1 }) },
  { id: "car_first", title: "Mein eigener Wagen", desc: "Erstes eigenes Privatauto", category: "besitz", xp: 200,
    condition: (s) => s.stats?.hasCar === true,
    progress: (s) => ({ current: s.stats?.hasCar ? 1 : 0, target: 1 }) },
  { id: "car_sport", title: "Ein alter Traum", desc: "Ein Sportwagen oder Supersportwagen im Privatbesitz", category: "besitz", xp: 300,
    condition: (s) => s.stats?.hasSportCar === true,
    progress: (s) => ({ current: s.stats?.hasSportCar ? 1 : 0, target: 1 }) },
  { id: "boat_first", title: "Auf dem Wasser", desc: "Ein eigenes Motorboot oder eine Yacht", category: "besitz", xp: 350,
    condition: (s) => s.stats?.hasBoat === true,
    progress: (s) => ({ current: s.stats?.hasBoat ? 1 : 0, target: 1 }) },
  { id: "home_villa", title: "Platz zum Träumen", desc: "Eine Villa als gekaufter aktiver Hauptwohnsitz", category: "besitz", xp: 500,
    condition: (s) => s.stats?.hasVilla === true,
    progress: (s) => ({ current: s.stats?.hasVilla ? 1 : 0, target: 1 }) },
  { id: "private_100k", title: "Auf eigenen Beinen", desc: "100.000 € privates Nettovermögen", category: "besitz", xp: 300,
    condition: (s, c) => c.privateNetWorth >= 10000000,
    progress: (s, c) => ({ current: Math.min(c.privateNetWorth, 10000000), target: 10000000 }) },
  { id: "private_1m", title: "Mein persönlicher Erfolg", desc: "1 Mio. € privates Nettovermögen", category: "besitz", xp: 600,
    condition: (s, c) => c.privateNetWorth >= 100000000,
    progress: (s, c) => ({ current: Math.min(c.privateNetWorth, 100000000), target: 100000000 }) },
];

// --- Erfahrungsstufen (6 Stufen) ---
export const XP_LEVELS = [
  { level: 1, minXp: 0, title: "Neuling" },
  { level: 2, minXp: 200, title: "Geübter Unternehmer" },
  { level: 3, minXp: 600, title: "Erfahrene Kraft" },
  { level: 4, minXp: 1200, title: "Speditionsprofi" },
  { level: 5, minXp: 2400, title: "Branchenkenner" },
  { level: 6, minXp: 4000, title: "Wirtschaftspersönlichkeit" },
];

// --- Unternehmensentwicklungsstufen ---
export const COMPANY_STAGES = [
  { id: "gruendung", name: "Gründung", minValueCents: 0 },
  { id: "aufbau", name: "Aufbau", minValueCents: 25000000 },        // 250.000 €
  { id: "millionengeschaeft", name: "Millionengeschäft", minValueCents: 100000000 }, // 1 Mio. €
  { id: "grossunternehmen", name: "Großunternehmen", minValueCents: 500000000 },    // 5 Mio. €
];

// --- Zielvorlagen für persönliche Lebensziele ---
export const GOAL_TEMPLATES = [
  { id: "g_sportscar", title: "Sportwagen ansparen", desc: "Einen Sportwagen kaufen (180.000 €)", category: "besitz",
    type: "purchase", targetCents: 18000000, nextAction: "Privatmittel ansparen" },
  { id: "g_home", title: "Eigenheim kaufen", desc: "Ein Haus mit Garten erwerben (350.000 €)", category: "besitz",
    type: "purchase", targetCents: 35000000, nextAction: "Eigenkapital aufbauen" },
  { id: "g_boat", title: "Motorboot ansparen", desc: "Ein Motorboot kaufen (90.000 €)", category: "besitz",
    type: "purchase", targetCents: 9000000, nextAction: "Privatmittel ansparen" },
  { id: "g_promises_5", title: "Fünf Zusagen einhalten", desc: "5 zugesagte Termine einhalten", category: "privatleben",
    type: "stat", statKey: "promisesKept", target: 5, nextAction: "Termine vereinbaren und einhalten" },
  { id: "g_balance_week", title: "Eine Woche gute Balance", desc: "7 Tage mit Zufriedenheit ≥70 und Belastung ≤40", category: "privatleben",
    type: "stat", statKey: "consecutiveBalanceDays", target: 7, nextAction: "Auf Erholung und Zufriedenheit achten" },
  { id: "g_fleet_10", title: "Zehn Lkw aufbauen", desc: "10 eigene Lkw gleichzeitig", category: "unternehmen",
    type: "stat", statKey: "vehicleCount", target: 10, nextAction: "Lkw kaufen und Aufträge annehmen" },
  { id: "g_deliveries_50", title: "50 Lieferungen", desc: "50 Aufträge erfolgreich liefern", category: "unternehmen",
    type: "stat", statKey: "totalDeliveries", target: 50, nextAction: "Aufträge annehmen und pünktlich liefern" },
  { id: "g_revenue_100k", title: "100.000 € Umsatz", desc: "100.000 € kumulierte Transportvergütungen", category: "unternehmen",
    type: "stat", statKey: "totalRevenueCents", target: 10000000, nextAction: "Aufträge annehmen und liefern" },
  { id: "g_company_1m", title: "Eine Million Unternehmenswert", desc: "1 Mio. € Unternehmensvermögenswert", category: "unternehmen",
    type: "stat", statKey: "companyValue", target: 100000000, nextAction: "Gewinne reinvestieren" },
];