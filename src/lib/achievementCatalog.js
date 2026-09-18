// Clientseitiger Spiegel des Erfolgs- und Fortschrittskatalogs für FERNWERK.
// Spiegelt base44/shared/achievementCatalog.ts für Darstellung und Vorschau.

export const ACHIEVEMENT_CATEGORIES = [
  { id: "unternehmen", label: "Unternehmen" },
  { id: "zuverlaessigkeit", label: "Zuverlässigkeit" },
  { id: "privatleben", label: "Privatleben" },
  { id: "besitz", label: "Besitz" },
];

// Nur aktive eigene Fahrzeuge zählen für Eigentums-Erfolge und Filialziele.
function ownedActiveVehicles(state) {
  return (state.vehicles || []).filter(v =>
    (v.ownership_type || "owned") === "owned" && v.status !== "sold" && v.status !== "archived");
}

export const ACHIEVEMENTS = [
  { id: "reliable_five", title: "Fünf Punktlandungen", desc: "5 aufeinanderfolgende pünktliche Lieferungen", category: "zuverlaessigkeit", xp: 75,
    condition: s => (s.stats?.consecutiveTimely || 0) >= 5,
    progress: s => ({ current: Math.min(s.stats?.consecutiveTimely || 0, 5), target: 5 }) },
  { id: "team_first_course", title: "Gemeinsam besser", desc: "Eine Weiterbildung im Team abschließen", category: "unternehmen", xp: 75,
    condition: s => (s.training?.enrollments || []).some(e => e.status === "completed"),
    progress: s => ({ current: (s.training?.enrollments || []).some(e => e.status === "completed") ? 1 : 0, target: 1 }) },
  { id: "promise_first", title: "Zeit, die zählt", desc: "Einen zugesagten persönlichen Termin einhalten", category: "privatleben", xp: 50,
    condition: s => (s.stats?.promisesKept || 0) >= 1,
    progress: s => ({ current: Math.min(s.stats?.promisesKept || 0, 1), target: 1 }) },

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
    condition: (s) => ownedActiveVehicles(s).length >= 4,
    progress: (s) => ({ current: Math.min(ownedActiveVehicles(s).length, 4), target: 4 }) },
  { id: "fleet_ten", title: "Eigene Flotte", desc: "10 eigene Lkw gleichzeitig", category: "unternehmen", xp: 300,
    condition: (s) => ownedActiveVehicles(s).length >= 10,
    progress: (s) => ({ current: Math.min(ownedActiveVehicles(s).length, 10), target: 10 }) },
  { id: "fleet_twentyfive", title: "Große Verantwortung", desc: "25 eigene Lkw gleichzeitig", category: "unternehmen", xp: 600,
    condition: (s) => ownedActiveVehicles(s).length >= 25,
    progress: (s) => ({ current: Math.min(ownedActiveVehicles(s).length, 25), target: 25 }) },
  { id: "revenue_100k", title: "Sechsstellig", desc: "100.000 € kumulierte Transportvergütungen", category: "unternehmen", xp: 250,
    condition: (s) => (s.stats?.totalRevenueCents || 0) >= 10000000,
    progress: (s) => ({ current: Math.min(s.stats?.totalRevenueCents || 0, 10000000), target: 10000000 }) },
  { id: "company_1m", title: "Die erste Million", desc: "1 Mio. € Unternehmensvermögenswert", category: "unternehmen", xp: 500,
    condition: (s, c) => c.companyValue >= 100000000,
    progress: (s, c) => ({ current: Math.min(c.companyValue, 100000000), target: 100000000 }) },
  { id: "company_5m", title: "Ein Lebenswerk wächst", desc: "5 Mio. € Unternehmensvermögenswert", category: "unternehmen", xp: 800,
    condition: (s, c) => c.companyValue >= 500000000,
    progress: (s, c) => ({ current: Math.min(c.companyValue, 500000000), target: 500000000 }) },
  { id: "dg_first", title: "Gefahrgut-Erstling", desc: "1 Gefahrgut-Lieferung abgeschlossen", category: "unternehmen", xp: 200,
    condition: (s) => (s.stats?.dgDeliveries || 0) >= 1,
    progress: (s) => ({ current: Math.min(s.stats?.dgDeliveries || 0, 1), target: 1 }) },
  { id: "dg_ten", title: "Sicherer Umgang", desc: "10 Gefahrgut-Lieferungen abgeschlossen", category: "unternehmen", xp: 400,
    condition: (s) => (s.stats?.dgDeliveries || 0) >= 10,
    progress: (s) => ({ current: Math.min(s.stats?.dgDeliveries || 0, 10), target: 10 }) },
  { id: "reliable_ten", title: "Verlässlich", desc: "10 aufeinanderfolgende rechtzeitige Lieferungen", category: "zuverlaessigkeit", xp: 250,
    condition: (s) => (s.stats?.consecutiveTimely || 0) >= 10,
    progress: (s) => ({ current: Math.min(s.stats?.consecutiveTimely || 0, 10), target: 10 }) },
  { id: "maintain_three", title: "Gut gepflegt", desc: "3 verschiedene eigene Lkw mit abgeschlossener Wartung", category: "zuverlaessigkeit", xp: 150,
    condition: (s) => (s.stats?.maintainedVehicleIds || []).length >= 3,
    progress: (s) => ({ current: Math.min((s.stats?.maintainedVehicleIds || []).length, 3), target: 3 }) },
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

export const XP_LEVELS = [
  { level: 1, minXp: 0, title: "Neuling" },
  { level: 2, minXp: 200, title: "Geübter Unternehmer" },
  { level: 3, minXp: 600, title: "Erfahrene Kraft" },
  { level: 4, minXp: 1200, title: "Speditionsprofi" },
  { level: 5, minXp: 2400, title: "Branchenkenner" },
  { level: 6, minXp: 4000, title: "Wirtschaftspersönlichkeit" },
];

export const COMPANY_STAGES = [
  { id: "gruendung", name: "Gründung", minValueCents: 0 },
  { id: "aufbau", name: "Aufbau", minValueCents: 25000000 },
  { id: "millionengeschaeft", name: "Millionengeschäft", minValueCents: 100000000 },
  { id: "grossunternehmen", name: "Großunternehmen", minValueCents: 500000000 },
];

export const GOAL_TEMPLATES = [
  { id: "g_sportscar", title: "Sportwagen ansparen", desc: "Einen Sportwagen kaufen (180.000 €)", category: "besitz",
    type: "purchase", targetCents: 18000000, nextAction: "Privatmittel ansparen",
    focus: ["work_life"], linkPath: "/zuhause", criterion: "180.000 € Privatkonto-Guthaben", rewardDesc: "Sportwagen-Kauf freigeschaltet" },
  { id: "g_home", title: "Eigenheim kaufen", desc: "Ein Haus mit Garten erwerben (350.000 €)", category: "besitz",
    type: "purchase", targetCents: 35000000, nextAction: "Eigenkapital aufbauen",
    focus: ["work_life"], linkPath: "/zuhause", criterion: "350.000 € Privatkonto-Guthaben", rewardDesc: "Eigenheim-Kauf freigeschaltet" },
  { id: "g_boat", title: "Motorboot ansparen", desc: "Ein Motorboot kaufen (90.000 €)", category: "besitz",
    type: "purchase", targetCents: 9000000, nextAction: "Privatmittel ansparen",
    focus: ["work_life"], linkPath: "/zuhause", criterion: "90.000 € Privatkonto-Guthaben", rewardDesc: "Motorboot-Kauf freigeschaltet" },
  { id: "g_promises_5", title: "Fünf Zusagen einhalten", desc: "5 zugesagte Termine einhalten", category: "privatleben",
    type: "stat", statKey: "promisesKept", target: 5, nextAction: "Termine vereinbaren und einhalten",
    focus: ["work_life"], linkPath: "/zuhause", criterion: "5 zugesagte und eingehaltene Termine", rewardDesc: "Profil-Titel „Darauf ist Verlass“" },
  { id: "g_balance_week", title: "Sieben Tage in Balance", desc: "7 aufeinanderfolgende Tage mit Zufriedenheit ≥70 und Belastung ≤40", category: "privatleben",
    type: "stat", statKey: "consecutiveBalanceDays", target: 7, nextAction: "Auf Erholung und Zufriedenheit achten",
    focus: ["work_life"], linkPath: "/zuhause", criterion: "7 aufeinanderfolgende Balance-Tage (Zufriedenheit ≥70, Belastung ≤40). Ein Tag außerhalb der Balance bricht die Serie.", rewardDesc: "Konzert-Gutschein (100 €)" },
  { id: "g_fleet_10", title: "Zehn Lkw aufbauen", desc: "10 eigene Lkw gleichzeitig", category: "unternehmen",
    type: "stat", statKey: "vehicleCount", target: 10, nextAction: "Lkw kaufen und Aufträge annehmen",
    focus: ["autonomous_team", "controlled_growth"], linkPath: "/fuhrpark", criterion: "10 eigene (nicht geleaste) Lkw gleichzeitig im Bestand", rewardDesc: "Erfolg „Eigene Flotte“ (300XP)" },
  { id: "g_deliveries_50", title: "50 Lieferungen", desc: "50 Aufträge erfolgreich liefern", category: "unternehmen",
    type: "stat", statKey: "totalDeliveries", target: 50, nextAction: "Aufträge annehmen und pünktlich liefern",
    focus: ["profitable"], linkPath: "/auftraege", criterion: "50 tatsächlich gelieferte Aufträge (kumulierter Zähler)", rewardDesc: "Erfolg „Die Räder drehen sich“ (400XP)" },
  { id: "g_revenue_100k", title: "100.000 € Umsatz", desc: "100.000 € kumulierte Transportvergütungen", category: "unternehmen",
    type: "stat", statKey: "totalRevenueCents", target: 10000000, nextAction: "Aufträge annehmen und liefern",
    focus: ["profitable"], linkPath: "/finanzen", criterion: "100.000 € kumulierte Transportvergütungen (nur Vergütung, vor Kosten)", rewardDesc: "Erfolg „Sechsstellig“ (250XP)" },
  { id: "g_company_1m", title: "Eine Million Unternehmenswert", desc: "1 Mio. € Unternehmensvermögenswert", category: "unternehmen",
    type: "stat", statKey: "companyValue", target: 100000000, nextAction: "Gewinne reinvestieren",
    focus: ["profitable", "controlled_growth"], linkPath: "/finanzen", criterion: "1 Mio. € Unternehmensvermögenswert (Firmenkonto + Fahrzeugbuchwerte − Kredite − offene Kosten). Kreditaufnahme allein erfüllt dieses Ziel nicht.", rewardDesc: "Erfolg „Die erste Million“ (500XP)" },

  // --- Neue Zielvorlagen (Geführter Einstieg & Entwicklung) ---
  { id: "g_first_five", title: "Die ersten fünf Lieferungen", desc: "Fünf erfolgreich abgeschlossene Transporte", category: "unternehmen",
    type: "custom", focus: ["profitable", "reliable"], linkPath: "/auftraege",
    criterion: "5 tatsächlich gelieferte Aufträge (dauerhafter Zähler stats.totalDeliveries). Abgebrochene oder gescheiterte Transporte zählen nicht.",
    rewardDesc: "Erfolg „Erste Lieferung“ + „Wort gehalten“ (insg. 300XP)",
    evaluate: (s) => {
      const current = Math.min(s.stats?.totalDeliveries || 0, 5);
      return { current, target: 5, completed: current >= 5, nextAction: "Aufträge annehmen und pünktlich liefern", deadlineMin: null, blockedReason: null, progressDetail: null };
    }
  },
  { id: "g_reliable_ten", title: "Verlässlich unterwegs", desc: "Zehn aufeinanderfolgende angenommene Transporte pünktlich abschließen", category: "zuverlaessigkeit",
    type: "custom", focus: ["reliable", "profitable"], linkPath: "/auftraege",
    criterion: "10 aufeinanderfolgende pünktliche Lieferungen. Ein gescheiterter oder verspäteter Transport unterbricht die Serie. Nicht angenommene Marktangebote haben keinen Einfluss.",
    rewardDesc: "Erfolg „Verlässlich“ (250XP)",
    evaluate: (s) => {
      const current = Math.min(s.stats?.consecutiveTimely || 0, 10);
      return { current, target: 10, completed: current >= 10, nextAction: "Aufträge pünktlich liefern — keine verspäteten oder gescheiterten Transporte", deadlineMin: null, blockedReason: null, progressDetail: null };
    }
  },
  { id: "g_stammkunde", title: "Ein Kunde bleibt", desc: "Einen Kunden zum Stammkunden entwickeln", category: "zuverlaessigkeit",
    type: "custom", focus: ["reliable"], linkPath: "/kunden",
    criterion: "Ein Kunde mit ≥5 abgeschlossenen Transporten UND Vertrauen ≥60 (Stammkunden-Status). Die Zählung beginnt ab Spielbeginn.",
    rewardDesc: "Rahmenvertrag-Option freigeschaltet",
    evaluate: (s) => {
      const relations = Object.values(s.customerRelations?.relations || {});
      const stammkunden = relations.filter(r => r.completedTransports >= 5 && r.trust >= 60);
      if (stammkunden.length >= 1) {
        return { current: 1, target: 1, completed: true, nextAction: "Ziel erreicht", deadlineMin: null, blockedReason: null, progressDetail: stammkunden.length + " Stammkunde(n) erreicht" };
      }
      const closest = relations
        .filter(r => r.completedTransports < 5 || r.trust < 60)
        .map(r => ({ r, score: Math.min(r.completedTransports / 5, r.trust / 60) }))
        .sort((a, b) => b.score - a.score)[0];
      if (closest) {
        return {
          current: Math.round(closest.score * 5), target: 5, completed: false,
          nextAction: "Aufträge für denselben Kunden pünktlich liefern",
          deadlineMin: null, blockedReason: null,
          progressDetail: closest.r.completedTransports + "/5 Transporte, Vertrauen " + Math.round(closest.r.trust) + "/60"
        };
      }
      return { current: 0, target: 1, completed: false, nextAction: "Aufträge annehmen und liefern", deadlineMin: null, blockedReason: null, progressDetail: null };
    }
  },
  { id: "g_contract_fulfillment", title: "Zusagen einhalten", desc: "Einen Rahmenvertrag mit ≥90% pünktlicher Erfüllung abschließen", category: "zuverlaessigkeit",
    type: "custom", focus: ["reliable"], linkPath: "/kunden",
    criterion: "Einen Rahmenvertrag vollständig abwickeln (Status „completed“) UND mindestens 90% der vereinbarten Transporte pünktlich erfüllen. Die exakte Anzahl ergibt sich aus transportsPerDay × 7 Tage.",
    rewardDesc: "Vertrauensbonus beim Kunden",
    evaluate: (s) => {
      const contracts = (s.contracts?.contracts || []).filter(c => c.status === "completed");
      let fulfilled = 0;
      let bestActive = null;
      for (const c of contracts) {
        const total = c.transportsPerDay * 7;
        if (total > 0 && c.timelyCount / total >= 0.9) fulfilled++;
      }
      const active = (s.contracts?.contracts || []).find(c => c.status === "active");
      if (active) {
        const total = active.transportsPerDay * 7;
        bestActive = { total, timely: active.timelyCount, delivered: active.deliveredCount, required: Math.ceil(total * 0.9) };
      }
      if (fulfilled >= 1) {
        return { current: 1, target: 1, completed: true, nextAction: "Ziel erreicht", deadlineMin: null, blockedReason: null, progressDetail: fulfilled + " Vertrag/Verträge erfüllt" };
      }
      const hasStammkunde = Object.values(s.customerRelations?.relations || {}).some(r => r.completedTransports >= 5 && r.trust >= 60);
      const blockedReason = !hasStammkunde ? "Benötigt zuerst einen Stammkunden (Ziel „Ein Kunde bleibt“)" : null;
      return {
        current: bestActive ? bestActive.timely : 0, target: bestActive ? bestActive.required : 1, completed: false,
        nextAction: bestActive ? bestActive.timely + "/" + bestActive.required + " pünktliche Lieferungen" : "Rahmenvertrag mit einem Stammkunden abschließen",
        deadlineMin: active ? active.endMin : null, blockedReason,
        progressDetail: bestActive ? bestActive.delivered + "/" + bestActive.total + " Transporten geliefert, " + bestActive.timely + " pünktlich" : null
      };
    }
  },
  { id: "g_auto_delegation", title: "Verantwortung übertragen", desc: "An zwei aufeinanderfolgenden Tagen mindestens je drei Mitarbeiterentscheidungen selbstständig ausführen lassen", category: "unternehmen",
    type: "custom", focus: ["autonomous_team"], linkPath: "/fuehrung",
    criterion: "Innerhalb von 2 aufeinanderfolgenden Spieltagen jeweils ≥3 zulässige Mitarbeiterentscheidungen selbstständig ausführen lassen (auto), ohne dass am jeweiligen Tagesende eine notwendige Freigabe überfällig ist.",
    rewardDesc: "Meilenstein „Eigenständiges Team“",
    evaluate: (s) => {
      const days = (s.stats?.autoDecisionDays || []).slice().sort((a, b) => a.day - b.day);
      let maxConsecutive = 0, current = 0, prevDay = -999;
      for (const d of days) {
        const ok = d.count >= 3 && !d.hadOverdue;
        if (ok && d.day === prevDay + 1) current++;
        else if (ok) current = 1;
        else current = 0;
        maxConsecutive = Math.max(maxConsecutive, current);
        prevDay = d.day;
      }
      const hasDispatcher = (s.employees || []).some(e => e.employmentStatus === "employed" && (e.role === "dispatcher" || e.role === "dispatcher_senior"));
      const blockedReason = !hasDispatcher ? "Benötigt einen eingestellten Disponenten mit autonomem Modus" : null;
      const recent = days.slice(-2);
      const detail = recent.map(d => "Tag " + d.day + ": " + d.count + " Entscheidungen" + (d.hadOverdue ? " (überfällige Freigabe!)" : "")).join(", ");
      return {
        current: Math.min(maxConsecutive, 2), target: 2, completed: maxConsecutive >= 2,
        nextAction: hasDispatcher ? "Disponent im autonomen Modus arbeiten lassen — Freigaben rechtzeitig erteilen" : "Disponent einstellen und auf „autonom“ setzen",
        deadlineMin: null, blockedReason, progressDetail: detail || null
      };
    }
  },
  { id: "g_branch_growth", title: "Mit Überblick wachsen", desc: "Eine weitere Filiale eröffnen und operativ in Betrieb nehmen", category: "unternehmen",
    type: "custom", focus: ["controlled_growth"], linkPath: "/filialen",
    criterion: "Eine zweite aktive Filiale eröffnen und ihre operative Arbeitsfähigkeit herstellen: ≥1 eigener Lkw an der Filiale, ≥1 Fahrer an der Filiale, ≥1 abgeschlossene Lieferung über diese Filiale.",
    rewardDesc: "Meilenstein „Mehrere Standorte“",
    evaluate: (s) => {
      const branches = (s.branches || []).filter(b => b.status === "active");
      let opCount = 0;
      for (const b of branches) {
        const hasVehicle = ownedActiveVehicles(s).some(v => v.branchId === b.id);
        const hasDriver = (s.drivers || []).some(d => d.branchId === b.id && d.employmentStatus === "employed");
        const hasDelivery = (b.stats?.deliveries || 0) >= 1;
        if (hasVehicle && hasDriver && hasDelivery) opCount++;
      }
      const day = Math.floor((s.gameTime || 0) / 1440) + 1;
      const blockedReason = day < 5 ? "Filialeröffnung ab Tag 5 möglich (aktuell Tag " + day + ")" : null;
      return {
        current: Math.min(opCount, 2), target: 2, completed: opCount >= 2,
        nextAction: opCount < 1 ? "Erste Filiale operativ machen (Lkw + Fahrer + Lieferung)" : "Zweite Filiale eröffnen und ausstatten",
        deadlineMin: null, blockedReason, progressDetail: opCount + "/2 operative Filialen"
      };
    }
  },
  { id: "g_story_complete", title: "Zeit für ein eigenes Vorhaben", desc: "Eine persönliche Geschichte oder ein gemeinsames Vorhaben abschließen", category: "privatleben",
    type: "custom", focus: ["work_life"], linkPath: "/zuhause",
    criterion: "Eine vorhandene private Geschichte oder ein gemeinsames Vorhaben abschließen. Unterschiedliche gültige Ausgänge erfüllen das Ziel; eine bestimmte Beziehungsentscheidung ist nicht vorgeschrieben. Abgebrochene oder abgelaufene Geschichten zählen nicht.",
    rewardDesc: "Chronik-Eintrag und Profil-Dekoration",
    evaluate: (s) => {
      const completed = (s.private?.stories?.runs || []).filter(r =>
        r.status === "completed" && r.completionType !== "cancelled" && r.completionType !== "expired"
      );
      const active = (s.private?.stories?.runs || []).filter(r => r.status === "offered" || r.status === "active");
      if (completed.length >= 1) {
        return { current: 1, target: 1, completed: true, nextAction: "Ziel erreicht", deadlineMin: null, blockedReason: null, progressDetail: completed.length + " Geschichte(n) abgeschlossen" };
      }
      return {
        current: 0, target: 1, completed: false,
        nextAction: active.length > 0 ? "Aktive Geschichte fortsetzen — Entscheidungen treffen und Termine einhalten" : "Auf das nächste Geschichtenangebot warten (erscheint regelmäßig)",
        deadlineMin: active[0]?.nextDeadlineMin || null, blockedReason: null, progressDetail: active.length > 0 ? active.length + " aktive Geschichte(n)" : null
      };
    }
  },
];