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
  SERVICE_START_MIN,
} from "./gameRules.ts";
import { deliverMessage } from "./mailEngine.ts";
import { pushEvent } from "./eventLog.ts";
import { suggestTours, confirmTour as doConfirmTour } from "./tourEngine.ts";

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

export function autoAcceptOrders(state, emp, m, log) {
  const config = state.assistantConfig || {};
  if (config.autoAcceptOrders === false) return;

  // Nur zur vollen Stunde ausführen (wird vom Adapter sichergestellt)
  const clock = m % 1440;
  if (clock % 60 !== 0) return;

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

  // F) Auftragsüberwachung & Auto-Disposition: jede Stunde
  monitorOrderDeadlines(state, emp, m, log);

  // G) Auftragsrückstau-Überwachung: jede Stunde
  if (config.backlogMonitoring !== false) {
    monitorOrderBacklog(state, emp, m, log);
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