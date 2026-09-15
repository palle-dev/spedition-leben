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
  formatGameTime,
  BRANCH_COST_PER_DAY,
  SERVICE_START_MIN, SERVICE_END_MIN,
} from "./gameRules.ts";
import { deliverMessage } from "./mailEngine.ts";
import { pushEvent } from "./eventLog.ts";
import { suggestTours, confirmTour as doConfirmTour } from "./tourEngine.ts";
import { previewCourseBooking, bookCourse, COURSE_CATALOG, hasQualification, isPersonInTraining } from "./trainingEngine.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";
import { isPersonAvailable } from "./absenceEngine.ts";

// ---------- Migration ----------

export function migrateAssistant(state) {
  if (!state.assistantLog) state.assistantLog = [];
  if (!state.assistantState) state.assistantState = { lastReportDay: 0, lastOptimizationDay: 0 };
  if (!state.assistantConfig) {
    state.assistantConfig = {
      dailyReport: true,
      autoAcceptOrders: true,
      costOptimization: true,
      decisionProposals: true,
      accounting: true,
      orderMonitoring: true,
      autoDispatch: false,
      autoAcceptMarginPct: 15,
      autoAcceptMinLiquidityCents: 50000,
      autoDispatchHoursBeforeDeadline: 4,
      maxOrdersPerHour: 3,
      maxBacklogOrders: 5,
      backlogMonitoring: true,
      staffDevelopment: true,
      autoBookTraining: false,
      trainingBudgetPerDay: 200,
      fleetUtilizationMonitoring: true,
      minFleetUtilizationPct: 60,
    };
  }
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

export function autoAcceptOrders(state, emp, m, log, force) {
  const config = state.assistantConfig || {};
  if (!force && config.autoAcceptOrders === false) return;

  // Nur zur vollen Stunde ausführen (wird vom Adapter sichergestellt),
  // außer bei erzwungener Ausführung (z.B. per E-Mail angefragt)
  const clock = m % 1440;
  if (!force && clock % 60 !== 0) return;

  const minMarginPct = (config.autoAcceptMarginPct ?? 15) / 100;
  const minLiquidityCents = config.autoAcceptMinLiquidityCents ?? 50000;
  const maxPerHour = config.maxOrdersPerHour ?? 3;

  // Stunden-Zähler (verhindert Massenannahme)
  const hourBucket = "autoAccept_h" + Math.floor(m / 60);
  state.assistantState = state.assistantState || {};
  const acceptedThisHour = state.assistantState[hourBucket] || 0;
  if (acceptedThisHour >= maxPerHour) return;

  const offered = (state.orders || []).filter(o =>
    o.status === "offered" && o.acceptDeadlineMin > m
  );
  if (offered.length === 0) return;

  // Backlog-Schutz: keine neuen Aufträge annehmen, wenn bereits zu viele
  // ungesplante angenommene Aufträge vorliegen (verhindert Aufstau).
  const busyOrderIds = new Set();
  for (const tr of state.trips) { if (tr.status === "in_progress" && tr.orderId) busyOrderIds.add(tr.orderId); }
  for (const tr of (state.tours || [])) {
    if (tr.status !== "active") continue;
    for (const d of (tr.deployments || [])) { if (d.orderId && d.status !== "cancelled") busyOrderIds.add(d.orderId); }
  }
  const unplannedBacklog = (state.orders || []).filter(o => o.status === "angenommen" && !busyOrderIds.has(o.id)).length;
  const maxBacklog = config.maxBacklogOrders ?? 5;
  if (unplannedBacklog >= maxBacklog) return;

  let accepted = 0;
  for (const o of offered) {
    if (acceptedThisHour + accepted >= maxPerHour) break;

    // Rentabilitätsschwelle: Beitrag muss positiv sein
    // Grobe Schätzung: 30% der Zahlung als Kosten (Kraftstoff + Maut)
    const estimatedCostCents = Math.round(o.paymentCents * 0.3);
    const marginCents = o.paymentCents - estimatedCostCents;
    const marginPct = o.paymentCents > 0 ? marginCents / o.paymentCents : 0;

    // Nur annehmen, wenn Marge >= Schwelle und Firma flüssig genug
    if (marginPct < minMarginPct) continue;
    if ((state.company?.accountCents || 0) - estimatedCostCents < minLiquidityCents) continue;

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

  state.assistantState[hourBucket] = acceptedThisHour + accepted;
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

// ---------- F) Auftragsüberwachung & Auto-Disposition ----------

export function monitorOrderDeadlines(state, emp, m, log) {
  const config = state.assistantConfig || {};
  if (config.orderMonitoring === false) return;

  const hoursBefore = config.autoDispatchHoursBeforeDeadline ?? 4;
  const thresholdMin = hoursBefore * 60;

  // Angenommene Aufträge, die noch nicht Teil einer aktiven Tour sind
  const atRisk = (state.orders || []).filter(o => {
    if (o.status !== "angenommen") return false;
    const hasTour = (state.tours || []).some(t =>
      t.status === "active" && (t.deployments || []).some(d => d.orderId === o.id && d.status !== "cancelled")
    );
    const hasTrip = (state.trips || []).some(t => t.orderId === o.id && t.status === "in_progress");
    return !hasTour && !hasTrip;
  });
  if (atRisk.length === 0) return;

  for (const o of atRisk) {
    const timeLeft = o.deliveryDeadlineMin - m;
    if (timeLeft <= 0 || timeLeft > thresholdMin) continue;

    // Auto-Dispatch versuchen, wenn aktiviert
    if (config.autoDispatch !== false) {
      const dispatched = tryAutoDispatch(state, emp, o, m, log);
      if (dispatched) continue;
    }

    // Warnung protokollieren (nur einmal pro Auftrag)
    const warnKey = "deadline_warn_" + o.id;
    state.assistantState = state.assistantState || {};
    if (state.assistantState[warnKey]) continue;
    state.assistantState[warnKey] = true;

    logAssistantActivity(state, {
      gameTime: m,
      type: "order_deadline_warning",
      assistantId: emp.id,
      assistantName: emp.name,
      details: {
        orderId: o.id,
        customer: o.customer,
        fromCity: o.fromCity,
        toCity: o.toCity,
        hoursLeft: Math.floor(timeLeft / 60),
        deliveryDeadlineMin: o.deliveryDeadlineMin,
      },
    });

    deliverMessage(state, {
      fromId: emp.id,
      toId: "player",
      subject: "⚠️ Auftragsfrist droht abzulaufen: " + o.customer,
      body: "Der angenommene Auftrag von " + o.customer + " (" + o.fromCity + " → " + o.toCity + ") muss bis " +
        formatGameTime(o.deliveryDeadlineMin) + " geliefert werden.\n\n" +
        "Verbleibende Zeit: " + Math.floor(timeLeft / 60) + " Stunden.\n\n" +
        "Bitte sorgen Sie für eine umgehende Disposition, sonst verfällt die Vergütung.",
      gameTime: m,
      category: "decisions",
      priority: "high",
      dedupKey: warnKey,
    });
  }
}

function tryAutoDispatch(state, emp, order, m, log) {
  const poolVehicles = (state.vehicles || []).filter(v =>
    v.status !== "sold" && v.status !== "archived" && !v.markedForSale
  );
  const poolVehicleIds = poolVehicles.map(v => v.id);
  if (poolVehicleIds.length === 0) return false;

  let result;
  try {
    result = suggestTours(state, {
      vehicleIds: poolVehicleIds,
      earliestStart: m,
      horizonMin: 2880,
      desiredEndCity: null,
      latestReturnMin: null,
      mode: state.marketPriority || "balanced",
      acceptNew: false,
    });
  } catch (e) {
    return false;
  }

  // Finde eine Tour, die den gefährdeten Auftrag enthält
  const matching = (result.suggestions || []).find(s => s.orderIds.includes(order.id));
  if (!matching) return false;

  try {
    const r = doConfirmTour(state, {
      vehicleId: matching.vehicleId,
      driverId: matching.driverId,
      orderIds: matching.orderIds,
      desiredEndCity: matching.plan.desiredEndCity || null,
      latestReturnMin: matching.plan.latestReturnMin || null,
    });

    for (const oid of matching.orderIds) {
      const o = state.orders.find(x => x.id === oid);
      if (!o) continue;
      o.plannedById = emp.id;
      o.plannedByName = emp.name;
      o.history = o.history || [];
      o.history.push({ type: "planned", min: m, actor: emp.id, actorName: emp.name, details: { vehicleId: matching.vehicleId, driverId: matching.driverId, auto: true } });
    }

    logAssistantActivity(state, {
      gameTime: m,
      type: "order_auto_dispatched",
      assistantId: emp.id,
      assistantName: emp.name,
      details: {
        orderId: order.id,
        customer: order.customer,
        fromCity: order.fromCity,
        toCity: order.toCity,
        vehicleId: matching.vehicleId,
        driverId: matching.driverId,
        tourId: r.tourId,
      },
    });

    pushEvent(state, {
      type: "order_auto_dispatched",
      gameTime: m,
      employeeId: emp.id,
      employeeName: emp.name,
      portraitId: emp.portraitId,
      orderIds: [order.id],
      tourId: r.tourId,
      vehicleId: matching.vehicleId,
      driverId: matching.driverId,
      details: {
        customer: order.customer,
        fromCity: order.fromCity,
        toCity: order.toCity,
      },
      dedupKey: "order_auto_dispatched:" + order.id,
    });

    log.push({ type: "assistant_auto_dispatch", employee: emp.id, order: order.id, vehicle: matching.vehicleId, atMin: m });
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- G) Auftragsrückstau-Überwachung ----------

export function monitorOrderBacklog(state, emp, m, log) {
  const config = state.assistantConfig || {};
  if (config.backlogMonitoring === false) return;

  const busyOrderIds = new Set();
  for (const tr of state.trips) { if (tr.status === "in_progress" && tr.orderId) busyOrderIds.add(tr.orderId); }
  for (const tr of (state.tours || [])) {
    if (tr.status !== "active") continue;
    for (const d of (tr.deployments || [])) { if (d.orderId && d.status !== "cancelled") busyOrderIds.add(d.orderId); }
  }
  const backlog = (state.orders || []).filter(o => o.status === "angenommen" && !busyOrderIds.has(o.id));
  const threshold = config.maxBacklogOrders ?? 5;
  if (backlog.length < threshold) return;

  // Nur einmal pro Tag warnen
  const day = dayOf(m);
  const warnKey = "backlog_warn_" + day;
  state.assistantState = state.assistantState || {};
  if (state.assistantState[warnKey]) return;
  state.assistantState[warnKey] = true;

  // Ursachenanalyse
  const freeVehicles = (state.vehicles || []).filter(v =>
    v.status === "free" && v.condition >= 20 && !v.markedForSale
  );
  const freeDrivers = (state.drivers || []).filter(d =>
    d.employmentStatus === "employed" && d.attendance !== "released" && d.status === "free"
  );

  let bottleneck, suggestion;
  if (freeVehicles.length === 0) {
    const totalVehicles = (state.vehicles || []).filter(v => v.status !== "sold" && v.status !== "archived").length;
    bottleneck = "Keine freien Fahrzeuge (" + totalVehicles + " gesamt, alle auf Tour/Wartung)";
    suggestion = "Fahrzeug kaufen oder leasen, oder bestehende Touren abschließen lassen";
  } else if (freeDrivers.length === 0) {
    const totalDrivers = (state.drivers || []).filter(d => d.employmentStatus === "employed").length;
    bottleneck = "Keine freien Fahrer (" + totalDrivers + " beschäftigt, alle auf Tour/Ruhe)";
    suggestion = "Fahrer einstellen oder bestehende Touren abschließen lassen";
  } else {
    bottleneck = "Fahrer/Fahrzeug nicht am gleichen Ort oder Touren nicht profitabel";
    suggestion = "Marktpriorität anpassen, Leerfahrten planen oder unrentable Aufträge stornieren";
  }

  logAssistantActivity(state, {
    gameTime: m,
    type: "order_backlog_warning",
    assistantId: emp.id,
    assistantName: emp.name,
    details: {
      backlogCount: backlog.length,
      threshold,
      bottleneck,
      suggestion,
      freeVehicles: freeVehicles.length,
      freeDrivers: freeDrivers.length,
    },
  });

  deliverMessage(state, {
    fromId: emp.id,
    toId: "player",
    subject: "⚠️ Auftragsrückstau: " + backlog.length + " ungesplante Aufträge",
    body: "Es liegen " + backlog.length + " angenommene Aufträge ohne geplante Tour vor (Schwellenwert: " + threshold + ").\n\n" +
      "Ursache: " + bottleneck + "\n" +
      "Freie Lkw: " + freeVehicles.length + ", Freie Fahrer: " + freeDrivers.length + "\n\n" +
      "Empfehlung: " + suggestion + "\n\n" +
      (config.autoAcceptOrders !== false
        ? "Die Auto-Auftragsannahme wurde aufgrund des Rückstaus automatisch gestoppt. Aktivieren Sie sie erneut, sobald der Rückstau abgebaut ist."
        : ""),
    gameTime: m,
    category: "decisions",
    priority: "high",
    dedupKey: warnKey,
  });

  pushEvent(state, {
    type: "assistant_backlog_warning",
    gameTime: m,
    employeeId: emp.id,
    employeeName: emp.name,
    portraitId: emp.portraitId,
    details: { backlogCount: backlog.length, bottleneck, suggestion },
    dedupKey: warnKey,
  });

  log.push({ type: "assistant_backlog_warning", employee: emp.id, backlogCount: backlog.length, atMin: m });
}

// ---------- H) Personalentwicklung ----------

export function manageStaffDevelopment(state, emp, m, log) {
  const config = state.assistantConfig || {};
  if (config.staffDevelopment === false) return;

  const day = dayOf(m);
  const spendKey = "training_spend_" + day;
  state.assistantState = state.assistantState || {};
  let spentToday = state.assistantState[spendKey] || 0;
  const budgetCents = (config.trainingBudgetPerDay ?? 200) * 100;
  const autoBook = config.autoBookTraining === true;

  // Alle beschäftigten Personen (Fahrer + Angestellte)
  const allPersons = [];
  for (const d of (state.drivers || [])) {
    if (isActivelyEmployed(d)) allPersons.push({ id: d.id, role: "driver", name: d.name });
  }
  for (const e of (state.employees || [])) {
    if (isActivelyEmployed(e)) allPersons.push({ id: e.id, role: e.role, name: e.name });
  }

  const bookedCourses = [];
  const suggestedCourses = [];

  for (const p of allPersons) {
    if (isPersonInTraining(state, p.id)) continue;
    if (!isPersonAvailable(state, p.id, m)) continue;

    // Relevante Kurse für diese Rolle finden
    const relevantCourses = COURSE_CATALOG.filter(c => {
      if (c.targetRole === "any") return true;
      const targetRoles = [c.targetRole];
      if (c.targetRoleSenior) targetRoles.push(c.targetRoleSenior);
      return targetRoles.includes(p.role);
    });

    for (const course of relevantCourses) {
      // Überspringen wenn Qualifikation bereits vorhanden
      if (course.effect && hasQualification(state, p.id, course.effect)) continue;

      // Voraussetzungen prüfen
      const preview = previewCourseBooking(state, p.id, course.id);
      if (!preview.ok) continue;

      // Promotions nur vorschlagen (brauchen Bestätigung)
      if (course.isPromotion) {
        suggestedCourses.push({
          personId: p.id, personName: p.name, role: p.role,
          courseLabel: course.label, feeCents: course.feeCents,
          newRole: course.promotionNewRole,
        });
        continue;
      }

      // Auto-Buchung: Budget und Firmenmittel prüfen
      if (autoBook && spentToday + course.feeCents <= budgetCents && state.company.accountCents >= course.feeCents) {
        try {
          bookCourse(state, p.id, course.id, {});
          spentToday += course.feeCents;
          bookedCourses.push({
            personId: p.id, personName: p.name, role: p.role,
            courseLabel: course.label, feeCents: course.feeCents, startMin: preview.startMin,
          });
          logAssistantActivity(state, {
            gameTime: m, type: "training_booked",
            assistantId: emp.id, assistantName: emp.name,
            details: {
              personId: p.id, personName: p.name,
              courseLabel: course.label, feeCents: course.feeCents, startMin: preview.startMin,
            },
          });
          pushEvent(state, {
            type: "assistant_training_booked",
            gameTime: m, employeeId: emp.id, employeeName: emp.name, portraitId: emp.portraitId,
            personId: p.id,
            details: { personName: p.name, courseLabel: course.label, feeCents: course.feeCents },
            dedupKey: "training_booked:" + p.id + ":" + course.id,
          });
          break; // Nur ein Kurs pro Person pro Tag
        } catch (e) { /* Buchung fehlgeschlagen – weitermachen */ }
      } else if (!autoBook) {
        suggestedCourses.push({
          personId: p.id, personName: p.name, role: p.role,
          courseLabel: course.label, feeCents: course.feeCents,
        });
        break; // Nur einen Kurs pro Person vorschlagen
      }
    }
  }

  state.assistantState[spendKey] = spentToday;

  // Mail mit Buchungen und Vorschlägen
  if (bookedCourses.length > 0 || suggestedCourses.length > 0) {
    let body = "";
    if (bookedCourses.length > 0) {
      body += "Automatisch gebuchte Kurse:\n";
      for (const c of bookedCourses) {
        body += "  • " + c.personName + " (" + c.role + ") → " + c.courseLabel + " – " + (c.feeCents / 100).toFixed(0) + " €\n";
      }
      body += "\nTagesbudget Training: " + (spentToday / 100).toFixed(0) + " € / " + (config.trainingBudgetPerDay ?? 200) + " €\n\n";
    }
    if (suggestedCourses.length > 0) {
      body += "Vorschläge (manuelle Buchung erforderlich):\n";
      for (const c of suggestedCourses) {
        const promo = c.newRole ? " → Beförderung zu " + c.newRole : "";
        body += "  • " + c.personName + " (" + c.role + ") → " + c.courseLabel + " – " + (c.feeCents / 100).toFixed(0) + " €" + promo + "\n";
      }
    }
    deliverMessage(state, {
      fromId: emp.id, toId: "player",
      subject: "Personalentwicklung – Tag " + day,
      body,
      gameTime: m, category: "personnel", priority: "normal",
      dedupKey: "assistant_training_" + day,
    });
  }
}

// ---------- I) Flottenauslastung-Überwachung ----------

export function monitorFleetUtilization(state, emp, m, log) {
  const config = state.assistantConfig || {};
  if (config.fleetUtilizationMonitoring === false) return;

  const totalVehicles = (state.vehicles || []).filter(v =>
    v.status !== "sold" && v.status !== "archived" && !v.markedForSale
  );
  if (totalVehicles.length === 0) return;

  const onTour = totalVehicles.filter(v => v.status === "on_trip").length;
  const inMaintenance = totalVehicles.filter(v => v.status === "maintenance").length;
  const free = totalVehicles.filter(v => v.status === "free").length;
  const available = totalVehicles.length - inMaintenance;
  if (available === 0) return;

  const utilization = onTour / available;
  const threshold = (config.minFleetUtilizationPct ?? 60) / 100;
  if (utilization >= threshold) return;

  // Nur einmal pro Tag warnen
  const day = dayOf(m);
  const warnKey = "fleet_util_warn_" + day;
  state.assistantState = state.assistantState || {};
  if (state.assistantState[warnKey]) return;
  state.assistantState[warnKey] = true;

  const freeDrivers = (state.drivers || []).filter(d =>
    d.employmentStatus === "employed" && d.attendance !== "released" && d.status === "free"
  );
  const acceptedOrders = (state.orders || []).filter(o => o.status === "angenommen");
  const offeredOrders = (state.orders || []).filter(o => o.status === "offered" && o.acceptDeadlineMin > m);

  // Prüfen ob angenommene Aufträge ungesplant sind
  const busyOrderIds = new Set();
  for (const tr of state.trips) { if (tr.status === "in_progress" && tr.orderId) busyOrderIds.add(tr.orderId); }
  for (const tr of (state.tours || [])) {
    if (tr.status !== "active") continue;
    for (const d of (tr.deployments || [])) { if (d.orderId && d.status !== "cancelled") busyOrderIds.add(d.orderId); }
  }
  const unplannedAccepted = acceptedOrders.filter(o => !busyOrderIds.has(o.id));

  let bottleneck, suggestion;
  if (free > 0 && freeDrivers.length > 0 && unplannedAccepted.length > 0) {
    const dispatchers = (state.employees || []).filter(e =>
      (e.role === "dispatcher" || e.role === "dispatcher_senior") &&
      isActivelyEmployed(e) && e.attendance === "present"
    );
    const hasAutonomous = dispatchers.some(d => d.workMode === "autonomous");
    if (dispatchers.length === 0) {
      bottleneck = free + " freie Lkw + " + freeDrivers.length + " freie Fahrer + " + unplannedAccepted.length + " ungesplante Aufträge, aber kein Disponent eingestellt";
      suggestion = "Disponent einstellen oder Aufträge manuell disponieren";
    } else if (!hasAutonomous) {
      bottleneck = free + " freie Lkw + " + freeDrivers.length + " freie Fahrer + " + unplannedAccepted.length + " ungesplante Aufträge, aber Disponent nicht autonom";
      suggestion = "Disponent auf 'autonomen Modus' umstellen, damit er selbstständig disponiert";
    } else {
      bottleneck = free + " freie Lkw + " + freeDrivers.length + " freie Fahrer + " + unplannedAccepted.length + " ungesplante Aufträge, Disposition läuft nicht";
      suggestion = "Disponent-Modus prüfen oder manuell disponieren";
    }
  } else if (free > 0 && freeDrivers.length > 0 && acceptedOrders.length === 0) {
    if (offeredOrders.length > 0) {
      bottleneck = free + " freie Lkw + " + freeDrivers.length + " freie Fahrer, aber keine angenommenen Aufträge (" + offeredOrders.length + " Angebote offen)";
      suggestion = config.autoAcceptOrders === false
        ? "Auto-Auftragsannahme aktivieren oder Angebote manuell annehmen"
        : "Angebote sind nicht profitabel genug – Marktpriorität oder Marge-Schwelle anpassen";
    } else {
      bottleneck = free + " freie Lkw + " + freeDrivers.length + " freie Fahrer, aber keine Aufträge auf dem Markt";
      suggestion = "Auf neue Marktangebote warten oder Marktpriorität anpassen";
    }
  } else if (free > 0 && freeDrivers.length === 0) {
    bottleneck = free + " freie Lkw aber keine freien Fahrer (alle auf Tour/Ruhe)";
    suggestion = "Fahrer einstellen oder auf Ruhe-Ende warten";
  } else if (free === 0 && onTour < totalVehicles.length) {
    bottleneck = "Alle Lkw auf Tour oder in Wartung – Flotte voll ausgelastet";
    suggestion = "Flotte erweitern (Lkw kaufen/leasen) für mehr Aufträge";
  } else {
    bottleneck = "Nur " + onTour + "/" + available + " Lkw auf Tour (" + Math.round(utilization * 100) + "%)";
    suggestion = "Situation prüfen – möglicherweise Fahrer/Fahrzeug-Konflikt oder unprofitable Touren";
  }

  logAssistantActivity(state, {
    gameTime: m, type: "fleet_utilization_warning",
    assistantId: emp.id, assistantName: emp.name,
    details: {
      onTour, available, total: totalVehicles.length,
      free, freeDrivers: freeDrivers.length,
      utilizationPct: Math.round(utilization * 100),
      thresholdPct: Math.round(threshold * 100),
      bottleneck, suggestion,
    },
  });

  deliverMessage(state, {
    fromId: emp.id, toId: "player",
    subject: "📉 Flottenauslastung niedrig: " + Math.round(utilization * 100) + "%",
    body: "Nur " + onTour + " von " + available + " verfügbaren Lkw sind auf Tour (Schwellenwert: " + Math.round(threshold * 100) + "%).\n\n" +
      "Freie Lkw: " + free + ", Freie Fahrer: " + freeDrivers.length + "\n" +
      "Angenommene Aufträge: " + acceptedOrders.length + " (" + unplannedAccepted.length + " ungesplant)\n" +
      "Marktangebote: " + offeredOrders.length + "\n\n" +
      "Ursache: " + bottleneck + "\n" +
      "Empfehlung: " + suggestion,
    gameTime: m, category: "decisions", priority: "high",
    dedupKey: warnKey,
  });

  pushEvent(state, {
    type: "assistant_fleet_warning",
    gameTime: m, employeeId: emp.id, employeeName: emp.name, portraitId: emp.portraitId,
    details: { onTour, available, utilizationPct: Math.round(utilization * 100), bottleneck, suggestion },
    dedupKey: warnKey,
  });

  log.push({ type: "assistant_fleet_warning", employee: emp.id, onTour, available, atMin: m });
}

// ---------- Proaktive Auto-Disposition ----------

// Versucht, alle ungesplanten angenommenen Aufträge zu disponieren — nicht nur
// die kurz vor der Frist. Wird jede Stunde aufgerufen, wenn autoDispatch aktiv.
// Ruft suggestTours einmal auf und bestätigt alle passenden Vorschläge.
export function proactiveAutoDispatch(state, emp, m, log, force) {
  const config = state.assistantConfig || {};
  if (!force && config.autoDispatch === false) return;

  // Performance: Überspringen, wenn autonome Disponenten im Dienst sind UND
  // kürzlich erfolgreich Touren geplant haben. Wenn der Disponent jedoch 0
  // Touren planen konnte (z.B. wegen Skip-Cache oder confirmTour-Fehlern),
  // fungiert der Assistent als Sicherheitsnetz und versucht es ebenfalls.
  const clock = m % 1440;
  const autonomousDispatchers = (state.employees || []).filter(e =>
    (e.role === "dispatcher" || e.role === "dispatcher_senior") &&
    isActivelyEmployed(e) && e.attendance === "present" &&
    e.workMode === "autonomous" &&
    (e.shiftStart ?? SERVICE_START_MIN) <= (e.shiftEnd ?? SERVICE_END_MIN)
      ? (clock >= (e.shiftStart ?? SERVICE_START_MIN) && clock < (e.shiftEnd ?? SERVICE_END_MIN))
      : (clock >= (e.shiftStart ?? SERVICE_START_MIN) || clock < (e.shiftEnd ?? SERVICE_END_MIN))
  );
  const dispatcherRecentlySucceeded = autonomousDispatchers.some(e =>
    (e._lastPlanPlanned || 0) > 0 && m - (e.lastDecisionMin || 0) < 60
  );
  if (dispatcherRecentlySucceeded) return;

  const busyOrderIds = new Set();
  for (const tr of state.trips) { if (tr.status === "in_progress" && tr.orderId) busyOrderIds.add(tr.orderId); }
  for (const tr of (state.tours || [])) {
    if (tr.status !== "active") continue;
    for (const d of (tr.deployments || [])) { if (d.orderId && d.status !== "cancelled") busyOrderIds.add(d.orderId); }
  }
  const unplanned = (state.orders || []).filter(o => o.status === "angenommen" && !busyOrderIds.has(o.id));
  if (unplanned.length === 0) return;

  const poolVehicles = (state.vehicles || []).filter(v =>
    v.status !== "sold" && v.status !== "archived" && !v.markedForSale
  );
  const poolVehicleIds = poolVehicles.map(v => v.id);
  if (poolVehicleIds.length === 0) return;

  let result;
  try {
    result = suggestTours(state, {
      vehicleIds: poolVehicleIds,
      earliestStart: m,
      horizonMin: 2880,
      desiredEndCity: null,
      latestReturnMin: null,
      mode: state.marketPriority || "balanced",
      acceptNew: false,
    });
  } catch (e) {
    return;
  }

  const unplannedIds = new Set(unplanned.map(o => o.id));
  const usedVehicleIds = new Set();
  let dispatched = 0;
  // suggestTours wird nur einmal pro Aufruf ausgeführt — die Bestätigung einzelner
  // Touren ist billig. Ein Limit von 3 hat bei großen Flotten zu Aufstau geführt,
  // weil pro Stunde nur 3 Lkw verplant wurden. Höheres Limit für volle Auslastung.
  const maxPerHour = 20;

  for (const matching of (result.suggestions || [])) {
    if (dispatched >= maxPerHour) break;
    if (usedVehicleIds.has(matching.vehicleId)) continue;
    const hasUnplanned = matching.orderIds.some(oid => unplannedIds.has(oid));
    if (!hasUnplanned) continue;

    try {
      const r = doConfirmTour(state, {
        vehicleId: matching.vehicleId,
        driverId: matching.driverId,
        orderIds: matching.orderIds,
        desiredEndCity: matching.plan.desiredEndCity || null,
        latestReturnMin: matching.plan.latestReturnMin || null,
      });
      usedVehicleIds.add(matching.vehicleId);

      for (const oid of matching.orderIds) {
        const o = state.orders.find(x => x.id === oid);
        if (!o) continue;
        o.plannedById = emp.id;
        o.plannedByName = emp.name;
        o.history = o.history || [];
        o.history.push({ type: "planned", min: m, actor: emp.id, actorName: emp.name, details: { vehicleId: matching.vehicleId, driverId: matching.driverId, auto: true } });
      }

      const primaryOrder = state.orders.find(x => x.id === matching.orderIds[0]);
      logAssistantActivity(state, {
        gameTime: m,
        type: "order_auto_dispatched",
        assistantId: emp.id,
        assistantName: emp.name,
        details: {
          orderId: primaryOrder?.id,
          customer: primaryOrder?.customer,
          fromCity: primaryOrder?.fromCity,
          toCity: primaryOrder?.toCity,
          vehicleId: matching.vehicleId,
          driverId: matching.driverId,
          tourId: r.tourId,
        },
      });

      pushEvent(state, {
        type: "order_auto_dispatched",
        gameTime: m,
        employeeId: emp.id,
        employeeName: emp.name,
        portraitId: emp.portraitId,
        orderIds: matching.orderIds,
        tourId: r.tourId,
        vehicleId: matching.vehicleId,
        driverId: matching.driverId,
        details: {
          customer: primaryOrder?.customer,
          fromCity: primaryOrder?.fromCity,
          toCity: primaryOrder?.toCity,
        },
        dedupKey: "order_auto_dispatched:" + matching.orderIds[0],
      });

      log.push({ type: "assistant_auto_dispatch", employee: emp.id, orders: matching.orderIds, vehicle: matching.vehicleId, atMin: m });
      dispatched++;
    } catch (e) {
      // Bestätigung fehlgeschlagen – weitermachen
    }
  }

  return dispatched;
}

// ---------- Haupt-Einstiegspunkte ----------

// Wird stündlich vom Adapter aufgerufen (zur vollen Spielstunde).
export function processAssistant(state, emp, m, log) {
  migrateAssistant(state);
  const config = state.assistantConfig || {};
  const clock = m % 1440;

  // A) Tagesbericht: einmal pro Tag um 08:00
  if (config.dailyReport !== false && clock === SERVICE_START_MIN) {
    generateDailyReport(state, emp, m);
  }

  // B) Auto-Auftragsannahme: jede Stunde
  if (config.autoAcceptOrders !== false) {
    autoAcceptOrders(state, emp, m, log);
  }

  // C) Gemeinkostenoptimierung: einmal pro Tag um 09:00
  if (config.costOptimization !== false && clock === SERVICE_START_MIN + 60) {
    optimizeOverheadCosts(state, emp, m);
  }

  // D) Entscheidungsvorbereitung: jede Stunde
  if (config.decisionProposals !== false) {
    prepareDecisionProposals(state, emp, m);
  }

  // E) Buchhaltungs-Support: jede Stunde
  if (config.accounting !== false) {
    processAssistantAccounting(state, emp, m);
  }

  // F) Proaktive Auto-Disposition: jede Stunde alle ungesplanten Aufträge versuchen
  if (config.autoDispatch !== false) {
    proactiveAutoDispatch(state, emp, m, log);
  }

  // F2) Frist-Überwachung & Warnungen: jede Stunde (Sicherheitsnetz für Rest-Aufträge)
  monitorOrderDeadlines(state, emp, m, log);

  // G) Auftragsrückstau-Überwachung: jede Stunde
  if (config.backlogMonitoring !== false) {
    monitorOrderBacklog(state, emp, m, log);
  }

  // H) Personalentwicklung: einmal pro Tag um 10:00
  if (config.staffDevelopment !== false && clock === SERVICE_START_MIN + 120) {
    manageStaffDevelopment(state, emp, m, log);
  }

  // I) Flottenauslastung-Überwachung: jede Stunde
  if (config.fleetUtilizationMonitoring !== false) {
    monitorFleetUtilization(state, emp, m, log);
  }
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