// Assistent der Geschäftsführung – Engine für FERNWERK.
// Kapselt fünf automatisierte Management-Funktionen:
//   A) Tagesbericht – tägliche Zusammenfassung per Mail an den GF
//   B) Auto-Auftragsannahme – profitable Marktangebote automatisch annehmen
//   C) Gemeinkostenoptimierung – Standortkosten bei Leerstand senken
//   D) Entscheidungsvorbereitung – Vorschläge für anstehende Entscheidungen
//   E) Buchhaltungs-Support – Buchhaltungsaufgaben des GF übernehmen
//
// Alle Aktionen werden in state.assistantLog protokolliert und über pushEvent
// als Toast sichtbar gemacht.

import {
  dayOf,
  BRANCH_COST_PER_DAY,
  SERVICE_START_MIN,
} from "./gameRules.ts";
import { deliverMessage } from "./mailEngine.ts";
import { pushEvent } from "./eventLog.ts";

// ---------- Migration ----------

export function migrateAssistant(state) {
  if (!state.assistantLog) state.assistantLog = [];
  if (!state.assistantState) state.assistantState = { lastReportDay: 0, lastOptimizationDay: 0 };
}

function logAssistantActivity(state, entry) {
  if (!state.assistantLog) state.assistantLog = [];
  state.assistantLog.push({
    id: "al_" + (state.assistantLog.length + 1),
    gameTime: entry.gameTime,
    type: entry.type,
    assistantId: entry.assistantId,
    assistantName: entry.assistantName,
    details: entry.details || {},
  });
  // Begrenzen für Speichereffizienz
  if (state.assistantLog.length > 300) {
    state.assistantLog = state.assistantLog.slice(-300);
  }
}

// ---------- A) Tagesbericht ----------

export function generateDailyReport(state, emp, m) {
  const day = dayOf(m);
  const ast = state.assistantState || (state.assistantState = {});
  if (ast.lastReportDay === day) return;
  ast.lastReportDay = day;

  // Tagesstatistiken berechnen
  const dayStart = Math.floor(m / 1440) * 1440;
  const deliveriesToday = (state.trips || []).filter(t =>
    t.status === "completed" && t.endMin >= dayStart && t.endMin < dayStart + 1440
  ).length;
  const revenueToday = (state.bookings || [])
    .filter(b => b.min >= dayStart && b.min < dayStart + 1440 && b.amountCents > 0)
    .reduce((s, b) => s + b.amountCents, 0);
  const fleetFree = (state.vehicles || []).filter(v => v.status === "free").length;
  const fleetTotal = (state.vehicles || []).filter(v => v.status !== "sold" && v.status !== "archived").length;
  const openOrders = (state.orders || []).filter(o => o.status === "offered").length;
  const acceptedOrders = (state.orders || []).filter(o => o.status === "angenommen").length;
  const companyBalance = state.company?.accountCents || 0;

  const body = `Tagesbericht – Tag ${day}\n\n` +
    `Lieferungen heute: ${deliveriesToday}\n` +
    `Umsatz heute: ${(revenueToday / 100).toFixed(2)} €\n` +
    `Firma­konto: ${(companyBalance / 100).toFixed(2)} €\n` +
    `Flotte: ${fleetFree}/${fleetTotal} Lkw frei\n` +
    `Aufträge: ${acceptedOrders} angenommen, ${openOrders} offen auf dem Markt\n` +
    `Fahrer: ${(state.drivers || []).filter(d => d.employmentStatus === "employed").length} aktiv\n\n` +
    (openOrders > 0 ? `Hinweis: ${openOrders} Angebot(e) warten auf Entscheidung.` : "Keine offenen Angebote.") +
    (companyBalance < 50000 ? `\n\n⚠️ Warnung: Liquidität unter 500 €. Kredite oder Kosten­senkung prüfen.` : "");

  deliverMessage(state, {
    fromId: emp.id,
    toId: "player",
    subject: `Tagesbericht – Tag ${day}`,
    body,
    gameTime: m,
    category: "reports",
    priority: "normal",
    dedupKey: `assistant_daily_report:${day}`,
  });

  logAssistantActivity(state, {
    gameTime: m,
    type: "daily_report",
    assistantId: emp.id,
    assistantName: emp.name,
    details: { day, deliveriesToday, revenueToday, fleetFree, fleetTotal, openOrders, acceptedOrders },
  });
}

// ---------- B) Auto-Auftragsannahme ----------

export function autoAcceptOrders(state, emp, m, log) {
  // Nur zur vollen Stunde ausführen (wird vom Adapter sichergestellt)
  const clock = m % 1440;
  if (clock % 60 !== 0) return;

  const offered = (state.orders || []).filter(o =>
    o.status === "offered" && o.acceptDeadlineMin > m
  );
  if (offered.length === 0) return;

  let accepted = 0;
  for (const o of offered) {
    // Rentabilitätsschwelle: Beitrag muss positiv sein
    // Grobe Schätzung: 30% der Zahlung als Kosten (Kraftstoff + Maut)
    const estimatedCostCents = Math.round(o.paymentCents * 0.3);
    const marginCents = o.paymentCents - estimatedCostCents;
    const marginPct = o.paymentCents > 0 ? marginCents / o.paymentCents : 0;

    // Nur annehmen, wenn Marge > 15% und Firma flüssig genug für Kraftstoff/Maut
    if (marginPct < 0.15) continue;
    if ((state.company?.accountCents || 0) < estimatedCostCents) continue;

    // Auftrag annehmen
    o.status = "angenommen";
    o.acceptedAtMin = m;
    o.acceptedById = emp.id;
    o.acceptedByName = emp.name;
    o.history = o.history || [];
    o.history.push({ type: "accepted", min: m, actor: emp.id, actorName: emp.name, auto: true });

    logAssistantActivity(state, {
      gameTime: m,
      type: "order_accepted",
      assistantId: emp.id,
      assistantName: emp.name,
      details: {
        orderId: o.id,
        customer: o.customer,
        fromCity: o.fromCity,
        toCity: o.toCity,
        paymentCents: o.paymentCents,
        marginCents,
        marginPct: Math.round(marginPct * 100),
      },
    });

    pushEvent(state, {
      type: "order_accepted_by_assistant",
      gameTime: m,
      employeeId: emp.id,
      employeeName: emp.name,
      portraitId: emp.portraitId,
      orderIds: [o.id],
      details: {
        customer: o.customer,
        fromCity: o.fromCity,
        toCity: o.toCity,
        paymentCents: o.paymentCents,
        marginPct: Math.round(marginPct * 100),
      },
    });

    log.push({ type: "assistant_order_accepted", employee: emp.id, order: o.id, atMin: m });
    accepted++;
  }

  return accepted;
}

// ---------- C) Gemeinkostenoptimierung ----------

export function optimizeOverheadCosts(state, emp, m) {
  const day = dayOf(m);
  const ast = state.assistantState || (state.assistantState = {});
  if (ast.lastOptimizationDay === day) return;
  ast.lastOptimizationDay = day;

  // Prüfe Filialen mit Leerstand: mehr Filialen als nötig
  const activeBranches = (state.branches || []).filter(b => b.status === "active");
  if (activeBranches.length <= 1) return; // Mindestens eine Filiale behalten

  const vehiclesPerBranch = activeBranches.map(b => ({
    branch: b,
    vehicleCount: (state.vehicles || []).filter(v => v.branchId === b.id && v.status !== "sold" && v.status !== "archived").length,
  }));

  // Finde Filialen mit 0–1 Fahrzeugen (Leerstand)
  const underutilized = vehiclesPerBranch.filter(vb => vb.vehicleCount <= 1);
  if (underutilized.length === 0) return;

  // Vorschlag: Standortkosten um 20% senken (simuliert Verhandlung / Effizienz)
  const reductionPct = 20;
  const savingCents = underutilized.length * Math.round(BRANCH_COST_PER_DAY * reductionPct / 100);

  logAssistantActivity(state, {
    gameTime: m,
    type: "cost_optimization",
    assistantId: emp.id,
    assistantName: emp.name,
    details: {
      branchCount: underutilized.length,
      reductionPct,
      savingCents,
      branches: underutilized.map(vb => vb.branch.name),
    },
  });

  deliverMessage(state, {
    fromId: emp.id,
    toId: "player",
    subject: "Gemeinkosten optimiert",
    body: `Ich habe ${underutilized.length} unterausgelastete Filiale(n) identifiziert: ${underutilized.map(vb => vb.branch.name).join(", ")}.\n\n` +
      `Empfehlung: Standortkosten um ${reductionPct}% senken oder Filialen zusammenlegen.\n` +
      `Potenzielle Tagesersparnis: ${(savingCents / 100).toFixed(2)} €.\n\n` +
      `Bitte genehmigen Sie die Maßnahme oder weisen Sie mich an, die Filialen zu schließen.`,
    gameTime: m,
    category: "decisions",
    priority: "normal",
    dedupKey: `assistant_cost_optimization:${day}`,
  });
}

// ---------- D) Entscheidungsvorbereitung ----------

export function prepareDecisionProposals(state, emp, m) {
  const proposals = [];

  // 1. Offene Einladungen
  const pendingInvitations = (state.appointments || []).filter(a =>
    a.status === "pending" && a.appearMin <= m && a.decisionDeadline > m
  );
  for (const inv of pendingInvitations) {
    const timeLeft = inv.decisionDeadline - m;
    proposals.push({
      title: "Einladung offen",
      reasoning: `Termin "${inv.text?.slice(0, 40) || "Freizeitabend"}" – Entscheidung fällig in ${Math.floor(timeLeft / 60)} Std.`,
      action: "Einladung annehmen oder ablehnen",
      priority: "high",
    });
  }

  // 2. Fahrzeuge mit schlechtem Zustand
  const poorCondition = (state.vehicles || []).filter(v =>
    v.status !== "sold" && v.status !== "archived" && v.condition < 30
  );
  for (const v of poorCondition) {
    proposals.push({
      title: "Wartung erforderlich",
      reasoning: `Fahrzeug ${v.id} hat Zustand ${v.condition}/100 – Wartung empfohlen.`,
      action: "Wartung beauftragen",
      priority: "medium",
    });
  }

  // 3. Niedrige Liquidität
  if ((state.company?.accountCents || 0) < 50000) {
    proposals.push({
      title: "Liquidität kritisch",
      reasoning: `Firma­konto unter 500 €. Kredit oder Kosten­senkung prüfen.`,
      action: "Finanzierung öffnen",
      priority: "high",
    });
  }

  // 4. Fahrer ohne Fahrzeug
  const freeDrivers = (state.drivers || []).filter(d =>
    d.employmentStatus === "employed" && d.status === "free"
  );
  const freeVehicles = (state.vehicles || []).filter(v =>
    v.status === "free" && v.condition >= 20
  );
  if (freeDrivers.length > freeVehicles.length && freeVehicles.length < freeDrivers.length) {
    proposals.push({
      title: "Fahrerüberhang",
      reasoning: `${freeDrivers.length} freie Fahrer, aber nur ${freeVehicles.length} freie Lkw. Fahrzeugkauf oder Entlastung prüfen.`,
      action: "Fahrzeug kaufen oder Fahrer freistellen",
      priority: "medium",
    });
  }

  if (proposals.length === 0) return;

  // Nur den wichtigsten Vorschlag protokollieren und mailen
  const top = proposals.sort((a, b) => {
    const pri = { high: 0, medium: 1, low: 2 };
    return (pri[a.priority] || 3) - (pri[b.priority] || 3);
  })[0];

  logAssistantActivity(state, {
    gameTime: m,
    type: "decision_proposal",
    assistantId: emp.id,
    assistantName: emp.name,
    details: { title: top.title, reasoning: top.reasoning, action: top.action, priority: top.priority },
  });

  deliverMessage(state, {
    fromId: emp.id,
    toId: "player",
    subject: `Entscheidungsvorschlag: ${top.title}`,
    body: `${top.reasoning}\n\nEmpfohlene Maßnahme: ${top.action}\n\n(Priorität: ${top.priority})`,
    gameTime: m,
    category: "decisions",
    priority: top.priority === "high" ? "high" : "normal",
    dedupKey: `assistant_decision:${dayOf(m)}:${top.title}`,
  });
}

// ---------- E) Buchhaltungs-Support ----------

export function processAssistantAccounting(state, emp, m) {
  if (!state.accounting) return;
  const taskQueue = state.accounting.taskQueue || [];
  const pending = taskQueue.filter(t => t.status === "pending");
  if (pending.length === 0) return;

  // Assistent kann 3 Aufgaben pro Zyklus vorbereiten (nicht abschließen – das
  // macht der Buchhalter). Er markiert sie als "vorbereitet" für schnellere
  // Abarbeitung.
  let processed = 0;
  for (const task of pending) {
    if (processed >= 3) break;
    // Nur Belegprüfung und Zahlungs­vorbereitung – kein Periodenabschluss
    if (task.type === "period_close") continue;
    if (task.assistantPrepared) continue;
    task.assistantPrepared = true;
    task.assistantPreparedAtMin = m;
    task.assistantPreparedBy = emp.id;
    processed++;
  }

  if (processed > 0) {
    logAssistantActivity(state, {
      gameTime: m,
      type: "accounting_task",
      assistantId: emp.id,
      assistantName: emp.name,
      details: { taskCount: processed, taskType: "preparation" },
    });
  }
}

// ---------- Haupt-Einstiegspunkte ----------

// Wird stündlich vom Adapter aufgerufen (zur vollen Spielstunde).
export function processAssistant(state, emp, m, log) {
  migrateAssistant(state);
  const clock = m % 1440;

  // A) Tagesbericht: einmal pro Tag um 08:00
  if (clock === SERVICE_START_MIN) {
    generateDailyReport(state, emp, m);
  }

  // B) Auto-Auftragsannahme: jede Stunde
  autoAcceptOrders(state, emp, m, log);

  // C) Gemeinkostenoptimierung: einmal pro Tag um 09:00
  if (clock === SERVICE_START_MIN + 60) {
    optimizeOverheadCosts(state, emp, m);
  }

  // D) Entscheidungsvorbereitung: jede Stunde
  prepareDecisionProposals(state, emp, m);

  // E) Buchhaltungs-Support: jede Stunde
  processAssistantAccounting(state, emp, m);
}

// Wird beim Tagesabschluss (Mitternacht) aufgerufen.
export function processAssistantDaily(state, m) {
  migrateAssistant(state);
  const assistants = (state.employees || []).filter(e =>
    e.role === "assistant" && e.employmentStatus === "employed" && e.attendance === "present"
  );
  // Beim Tagesabschluss nichts zusätzlich – Tagesbericht läuft um 08:00
  // (processAssistant). Diese Funktion ist für zukünftige Erweiterungen.
}