// Intent-Erkennung und Staff-Task-Verarbeitung fuer FERNWERK Auftrag 13.
// Wandelt Freitext in gepruefte Spielhandlungen um. Kernablauf funktioniert
// ohne externes Sprachmodell.

import { deliverMessage, getPersonInfo, isEmployeeAvailable } from "./mailEngine.ts";
import { formatGameTime, dayOf, SERVICE_START_MIN, SERVICE_END_MIN } from "./gameRules.ts";
import { findReturnLoads, suggestTours } from "./tourEngine.ts";

// ---------- Text-Normalisierung ----------

function normalize(text) {
  return (text || "").toLowerCase()
    .replace(/\u00e4/g, "ae").replace(/\u00f6/g, "oe").replace(/\u00fc/g, "ue").replace(/\u00df/g, "ss")
    .replace(/\u201e/g, "").replace(/\u201c/g, "").replace(/\u201d/g, "");
}

// ---------- Intent-Erkennung ----------

const INTENT_PATTERNS = [
  { type: "acknowledge", keywords: ["danke", "dank", "kenntnis", "verstanden", "zur kenntnis"], label: "Zur Kenntnis nehmen", requiresDecision: false },
  { type: "find_return_load", keywords: ["rueckladung", "rueckfracht", "fracht zurueck", "ladung zurueck", "lade rueck"], label: "R\u00fcckladung suchen", requiresDecision: false, createsTask: true, roles: ["dispatcher", "dispatcher_senior"] },
  { type: "suggest_alternative", keywords: ["alternativ", "andere tour", "andere kombination", "anderer vorschlag", "andere moeglichkeit", "andere loesung"], label: "Alternative vorschlagen", requiresDecision: false, createsTask: true, roles: ["dispatcher", "dispatcher_senior"] },
  { type: "change_mode", keywords: ["selbststaendig", "autonom", "befugnisse", "modus aendern", "eigenstaendig", "darfst selbst", "alleine entscheiden"], label: "Befugnisse \u00e4ndern", requiresDecision: true, roles: ["dispatcher", "dispatcher_senior"] },
  { type: "change_rules", keywords: ["vorgabe", "budget", "region", "kostenlimit", "kostenrahmen", "tagesbudget", "kostenrahmen aendern"], label: "Vorgaben \u00e4ndern", requiresDecision: true, roles: ["dispatcher", "dispatcher_senior"] },
  { type: "approve_vacation", keywords: ["urlaub"], label: "Urlaub pr\u00fcfen", requiresDecision: true, roles: ["driver", "dispatcher", "dispatcher_senior", "cleaner", "mechanic", "accountant", "accountant_senior"] },
  { type: "organize_replacement", keywords: ["vertretung", "ersetzung", "ersetzen"], label: "Vertretung pr\u00fcfen", requiresDecision: false, createsTask: true },
  { type: "approve_repair", keywords: ["reparatur", "werkstatt freigeben", "reparatur freigeben", "werkstattauftrag"], label: "Reparatur freigeben", requiresDecision: true, roles: ["mechanic"] },
  { type: "check_cleaning_need", keywords: ["reinigung", "bedarf", "sauber", "putz"], label: "Reinigungsbedarf pr\u00fcfen", requiresDecision: false, createsTask: true, roles: ["cleaner"] },
  { type: "explain_due_items", keywords: ["faellig", "faelligkeiten", "offene posten", "verbindlichkeiten", "schulden"], label: "F\u00e4lligkeiten erl\u00e4utern", requiresDecision: false, createsTask: true, roles: ["accountant", "accountant_senior"] },
  { type: "prepare_payments", keywords: ["zahlung vorbereiten", "zahlungen vorbereiten", "ueberweisung vorbereiten", "zahlungen abwickeln"], label: "Zahlungen vorbereiten", requiresDecision: false, createsTask: true, roles: ["accountant", "accountant_senior"] },
  { type: "approve_payment", keywords: ["bezahlen", "zahlung freigeben", "ueberweisen", "begleichen", "rechnung bezahlen"], label: "Zahlung freigeben", requiresDecision: true, roles: ["accountant", "accountant_senior"] },
  { type: "approve_plan", keywords: ["freigeben", "freigabe", "plan bestaetigen", "bestaetigen", "plan freigeben", "tour freigeben"], label: "Plan freigeben", requiresDecision: true, roles: ["dispatcher", "dispatcher_senior"] },
  { type: "blockade_reason", keywords: ["grund", "warum", "wieso", "weshalb", "blockade", "blockiert", "warum nicht", "warum geht nicht"], label: "Grund erfragen", requiresDecision: false, createsTask: true },
  { type: "status_request", keywords: ["status", "wie geht", "stand", "lage", "uebersicht", "wie laeuft", "wie laufen"], label: "Status erfragen", requiresDecision: false, createsTask: true },
];

export function detectIntent(text, context) {
  const norm = normalize(text);
  if (!norm.trim()) return null;

  for (const pattern of INTENT_PATTERNS) {
    const matched = pattern.keywords.some(kw => norm.includes(kw));
    if (!matched) continue;
    // Rollen-Pruefung: wenn der Empfaenger eine Rolle hat, pruefen
    if (pattern.roles && context?.recipientRoleKey && !pattern.roles.includes(context.recipientRoleKey)) {
      continue;
    }
    return {
      type: pattern.type,
      label: pattern.label,
      requiresDecision: pattern.requiresDecision || false,
      createsTask: pattern.createsTask || false,
    };
  }
  return null;
}

export function getIntentByType(type, recipientRoleKey) {
  const pattern = INTENT_PATTERNS.find(p => p.type === type);
  if (!pattern) return null;
  if (pattern.roles && recipientRoleKey && !pattern.roles.includes(recipientRoleKey)) return null;
  return { type: pattern.type, label: pattern.label, requiresDecision: pattern.requiresDecision || false, createsTask: pattern.createsTask || false };
}

export function getQuickReplies(recipientRoleKey) {
  const base = [
    { intent: "status_request", label: "Status erfragen" },
    { intent: "acknowledge", label: "Vielen Dank, zur Kenntnis genommen" },
  ];
  const roleSpecific = {
    dispatcher: [
      { intent: "find_return_load", label: "R\u00fcckladung suchen" },
      { intent: "suggest_alternative", label: "Andere Kombination vorschlagen" },
      { intent: "approve_plan", label: "Plan zur Freigabe vorlegen" },
      { intent: "change_mode", label: "Befugnisse \u00e4ndern" },
    ],
    dispatcher_senior: [
      { intent: "find_return_load", label: "R\u00fcckladung suchen" },
      { intent: "suggest_alternative", label: "Andere Kombination vorschlagen" },
      { intent: "approve_plan", label: "Bestehenden Plan freigeben" },
    ],
    accountant: [
      { intent: "explain_due_items", label: "F\u00e4lligkeiten erl\u00e4utern" },
      { intent: "prepare_payments", label: "Zahlungen vorbereiten" },
      { intent: "approve_payment", label: "Zahlung freigeben" },
    ],
    accountant_senior: [
      { intent: "explain_due_items", label: "F\u00e4lligkeiten erl\u00e4utern" },
      { intent: "prepare_payments", label: "Zahlungen vorbereiten" },
      { intent: "approve_payment", label: "Zahlung freigeben" },
    ],
    mechanic: [
      { intent: "approve_repair", label: "Reparatur freigeben" },
    ],
    cleaner: [
      { intent: "check_cleaning_need", label: "Zus\u00e4tzlichen Bedarf pr\u00fcfen" },
    ],
    driver: [
      { intent: "blockade_reason", label: "Grund der Blockade erfragen" },
    ],
  };
  return [...(roleSpecific[recipientRoleKey] || []), ...base];
}

// ---------- Staff-Task-Verarbeitung ----------

export function processStaffTasks(state, m, log) {
  if (!state.mail?.staffTasks) return;
  for (const task of state.mail.staffTasks) {
    if (task.status !== "pending") continue;
    if (m < task.earliestProcessMin) continue;

    const avail = isEmployeeAvailable(state, task.employeeId, m);
    if (!avail.available) continue;

    task.status = "in_progress";
    task.startedAtMin = m;

    const result = executeTask(state, task, m);

    task.status = result.failed ? "failed" : "completed";
    task.completedAtMin = m;
    task.result = result;

    log.push({ type: "staff_task_" + task.status, taskId: task.id, taskType: task.type, atMin: m });
  }
}

function executeTask(state, task, m) {
  const empInfo = getPersonInfo(state, task.employeeId);
  const conv = (state.mail?.conversations || []).find(c => c.id === task.conversationId);
  const originalMsg = (state.mail?.messages || []).find(msg => msg.id === task.messageId);

  try {
    let body = "";
    let subject = "Re: " + (conv?.subject || "Anfrage");
    let linkedRefs = [];

    switch (task.type) {
      case "status_request": {
        body = generateStatusReport(state, task.employeeId, m);
        break;
      }
      case "blockade_reason": {
        body = generateBlockadeReason(state, task.employeeId, m);
        break;
      }
      case "find_return_load": {
        const result = findReturnLoadForTour(state, task);
        body = result.body;
        linkedRefs = result.linkedRefs;
        break;
      }
      case "suggest_alternative": {
        const result = suggestAlternativeTour(state, task);
        body = result.body;
        linkedRefs = result.linkedRefs;
        break;
      }
      case "explain_due_items": {
        body = explainDueItems(state, m);
        break;
      }
      case "prepare_payments": {
        body = preparePaymentsReport(state, m);
        break;
      }
      case "check_cleaning_need": {
        body = checkCleaningNeed(state, m);
        break;
      }
      case "organize_replacement": {
        body = organizeReplacement(state, task, m);
        break;
      }
      case "acknowledge": {
        body = "Vielen Dank f\u00fcr Deine Nachricht. Ich habe sie zur Kenntnis genommen.";
        break;
      }
      default: {
        body = "Ich habe Deine Nachricht erhalten, konnte aber keine konkrete Anweisung erkennen. Bitte beschreibe genauer, was ich tun soll.";
      }
    }

    deliverMessage(state, {
      fromId: task.employeeId,
      toId: "player",
      subject,
      body,
      gameTime: m,
      category: conv?.category || "operations",
      conversationId: task.conversationId,
      linkedRefs,
      sourceEvent: "task_reply_" + task.type,
      status: "delivered",
    });

    return { ok: true, body };
  } catch (e) {
    deliverMessage(state, {
      fromId: task.employeeId,
      toId: "player",
      subject: "Re: " + (conv?.subject || "Anfrage"),
      body: "Bei der Bearbeitung Deiner Anfrage ist ein Fehler aufgetreten: " + e.message + "\n\nBitte versuche es erneut oder kontaktiere eine andere Person.",
      gameTime: m,
      category: conv?.category || "operations",
      conversationId: task.conversationId,
      sourceEvent: "task_error",
      status: "delivered",
    });
    return { ok: false, error: e.message, failed: true };
  }
}

// ---------- Task-Implementierungen ----------

function generateStatusReport(state, personId, m) {
  const info = getPersonInfo(state, personId);
  const lines = [];
  lines.push("Statusbericht von " + info.name + " (" + info.role + ") am " + formatGameTime(m) + ":");

  if (info.roleKey === "dispatcher" || info.roleKey === "dispatcher_senior") {
    const emp = (state.employees || []).find(e => e.id === personId);
    const assignedVehicles = (emp?.assignedVehicleIds || []).map(vid => state.vehicles.find(v => v.id === vid)).filter(Boolean);
    const free = assignedVehicles.filter(v => v.status === "free");
    const onTrip = assignedVehicles.filter(v => v.status === "on_trip");
    const maintenance = assignedVehicles.filter(v => v.status === "maintenance");
    const accepted = state.orders.filter(o => o.status === "angenommen");
    const pendingSugs = (emp?.suggestions || []).filter(s => s.status === "pending");

    lines.push("");
    lines.push("Betreute Flotte: " + assignedVehicles.length + " Lkw");
    lines.push("- Frei: " + free.length + (free.length > 0 ? " (" + free.map(v => v.id).join(", ") + ")" : ""));
    lines.push("- Unterwegs: " + onTrip.length);
    lines.push("- Wartung: " + maintenance.length);
    lines.push("");
    lines.push("Angenommene Auftraege: " + accepted.length);
    if (accepted.length > 0) {
      for (const o of accepted.slice(0, 5)) {
        lines.push("- " + o.id + ": " + o.customer + " (" + o.fromCity + " -> " + o.toCity + ")");
      }
    }
    lines.push("");
    lines.push("Offene Vorschlaege: " + pendingSugs.length);
    lines.push("Delegationsmodus: " + (emp?.workMode || "suggestions"));
  } else if (info.roleKey === "accountant" || info.roleKey === "accountant_senior") {
    const openItems = (state.accounting?.openItems || []).filter(o => o.remainingCents > 0);
    const receipts = (state.accounting?.receipts || []).filter(r => r.status === "generated");
    lines.push("");
    lines.push("Firmenkonto: " + formatEuroBackend(state.company.accountCents));
    lines.push("Offene Posten: " + openItems.length + " (" + formatEuroBackend(openItems.reduce((s, o) => s + o.remainingCents, 0)) + ")");
    lines.push("Ungepruefte Belege: " + receipts.length);
  } else if (info.roleKey === "driver") {
    const driver = (state.drivers || []).find(d => d.id === personId);
    lines.push("");
    lines.push("Status: " + (driver?.status || "unbekannt"));
    lines.push("Standort: " + (driver?.locationCity || "unbekannt"));
    if (driver?.status === "resting" && driver.restUntil) {
      lines.push("Erholung bis: " + formatGameTime(driver.restUntil));
    }
  } else {
    lines.push("");
    lines.push("Aktivitaet: " + (info.attendance || "unbekannt"));
  }

  return lines.join("\n");
}

function generateBlockadeReason(state, personId, m) {
  const info = getPersonInfo(state, personId);
  const lines = [];
  lines.push("Hallo, hier ist " + info.name + ". Zu Deiner Frage:");

  if (info.roleKey === "dispatcher" || info.roleKey === "dispatcher_senior") {
    const emp = (state.employees || []).find(e => e.id === personId);
    const assignedVehicles = (emp?.assignedVehicleIds || []).map(vid => state.vehicles.find(v => v.id === vid)).filter(Boolean);
    const free = assignedVehicles.filter(v => v.status === "free");
    const accepted = state.orders.filter(o => o.status === "angenommen");
    const pendingSugs = (emp?.suggestions || []).filter(s => s.status === "pending");

    if (emp?.workMode === "suggestions" && pendingSugs.length > 0) {
      lines.push("");
      lines.push("Ich arbeite im Modus 'Vorschlaege vorbereiten'. Deshalb habe ich heute noch keinen neuen Auftrag angenommen. " + pendingSugs.length + " konkrete Tourenvorschlaege sind fertig. Du kannst sie einzeln freigeben oder meine Befugnisse aendern.");
    } else if (free.length === 0) {
      lines.push("");
      lines.push("Aktuell sind keine Lkw meiner Flotte frei. Alle Fahrzeuge sind unterwegs oder in Wartung.");
    } else if (accepted.length === 0) {
      lines.push("");
      lines.push("Es sind keine angenommenen Auftraege zu planen vorhanden. Neue Angebote kann ich im aktuellen Modus nicht selbst annehmen.");
    } else {
      lines.push("");
      lines.push("Es gibt aktuell keine Blockade. Ich kann Auftraege planen, sobald Du sie freigibst.");
    }
  } else if (info.roleKey === "driver") {
    const driver = (state.drivers || []).find(d => d.id === personId);
    if (driver?.status === "resting" && driver.restUntil) {
      lines.push("");
      lines.push("Ich bin noch in der Erholung bis " + formatGameTime(driver.restUntil) + ". Danach bin ich wieder verfuegbar.");
    } else if (driver?.status === "on_trip") {
      lines.push("");
      lines.push("Ich bin aktuell auf einer Fahrt und kann waehrend der Fahrt keine weiteren Aufgaben uebernehmen.");
    } else {
      lines.push("");
      lines.push("Es gibt aktuell keine Blockade. Ich bin verfuegbar.");
    }
  } else {
    lines.push("");
    lines.push("Es gibt aktuell keine konkrete Blockade auf meiner Seite.");
  }

  return lines.join("\n");
}

function findReturnLoadForTour(state, task) {
  const tourId = task.params?.tourId;
  const orderId = task.params?.orderId;
  let primaryOrderId = orderId;
  let vehicleId = task.params?.vehicleId;
  let driverId = task.params?.driverId;

  // Versuche Tour oder aktiven Trip zu finden
  if (tourId) {
    const tour = (state.tours || []).find(t => t.id === tourId);
    if (tour && tour.deployments && tour.deployments.length > 0) {
      primaryOrderId = tour.deployments[0].orderId;
      vehicleId = tour.deployments[0].vehicleId;
      driverId = tour.deployments[0].driverId;
    }
  }
  if (!primaryOrderId) {
    // Nimm den ersten aktiven Trip
    const trip = state.trips.find(t => t.status === "in_progress" && t.type === "loaded");
    if (trip) {
      primaryOrderId = trip.orderId;
      vehicleId = trip.vehicleId;
      driverId = trip.driverId;
    }
  }
  if (!primaryOrderId || !vehicleId || !driverId) {
    return {
      body: "Ich konnte keine konkrete Tour finden, fuer die ich eine Rueckladung suchen soll. Bitte nenne mir die Auftragsnummer oder die Tour.",
      linkedRefs: [],
    };
  }

  const r = findReturnLoads(state, primaryOrderId, vehicleId, driverId);
  if (r.error) {
    return { body: "Ich konnte keine Rueckladung suchen: " + r.error, linkedRefs: [] };
  }
  if (!r.candidates || r.candidates.length === 0) {
    return {
      body: "Ich habe nach passenden Rueckladungen gesucht. Aktuell ist kein Angebot verfuegbar, das Deinen Vorgaben entspricht.\n\nSobald ein passendes Angebot auf dem Markt erscheint, lege ich Dir einen Vorschlag vor.",
      linkedRefs: [{ type: "order", id: primaryOrderId }],
    };
  }

  const lines = ["Ich habe " + r.candidates.length + " passende Rueckladung(en) gefunden:"];
  for (const c of r.candidates.slice(0, 5)) {
    lines.push("- " + c.customer + ": " + c.fromCity + " -> " + c.toCity + " (" + c.cargo + ", " + c.tons + " t) - Verguetung: " + formatEuroBackend(c.paymentCents));
  }
  lines.push("");
  lines.push("Soll ich einen dieser Auftraege annehmen und einplanen? Bitte gib mir die Freigabe.");
  return {
    body: lines.join("\n"),
    linkedRefs: [{ type: "order", id: primaryOrderId }],
  };
}

function suggestAlternativeTour(state, task) {
  const vehicleId = task.params?.vehicleId;
  const r = suggestTours(state, {
    vehicleIds: vehicleId ? [vehicleId] : (state.vehicles || []).filter(v => v.status === "free").map(v => v.id),
    earliestStart: state.gameTime,
    horizonMin: 2880,
    mode: "balanced",
    acceptNew: true,
  });

  if (!r.suggestions || r.suggestions.length === 0) {
    return {
      body: "Ich habe alternative Touren geprueft. Aktuell sind keine ausfuehrbaren Kombinationen verfuegbar.\n\nGruende: Keine freien Fahrzeuge, keine passenden Angebote oder nicht ausreichende Liquiditaet.",
      linkedRefs: [],
    };
  }

  const lines = ["Ich habe " + r.suggestions.length + " alternative Tourvorschlaege erarbeitet:"];
  for (const s of r.suggestions.slice(0, 5)) {
    const v = state.vehicles.find(x => x.id === s.vehicleId);
    const orders = s.orderIds.map(oid => state.orders.find(o => o.id === oid)).filter(Boolean);
    const totalPayment = orders.reduce((sum, o) => sum + (o?.paymentCents || 0), 0);
    lines.push("- Lkw " + (v?.id || s.vehicleId) + ": " + orders.length + " Auftrag(aege), Gesamtv erguetung: " + formatEuroBackend(totalPayment) + ", Beitrag: " + formatEuroBackend(s.contributionCents || (totalPayment - (s.totalCostCents || 0))));
  }
  lines.push("");
  lines.push("Welche Alternative soll ich verbindlich einplanen?");
  return {
    body: lines.join("\n"),
    linkedRefs: r.suggestions.slice(0, 5).map(s => ({ type: "vehicle", id: s.vehicleId })),
  };
}

function explainDueItems(state, m) {
  const items = (state.accounting?.openItems || []).filter(o => o.remainingCents > 0);
  if (items.length === 0) {
    return "Es sind aktuell keine offenen Posten vorhanden. Alle Verbindlichkeiten wurden beglichen.";
  }
  const lines = ["Uebersicht der offenen Posten am " + formatGameTime(m) + ":"];
  lines.push("");
  for (const item of items.slice(0, 10)) {
    lines.push("- " + (item.text || item.id) + ": " + formatEuroBackend(item.remainingCents) + (item.dueMin ? " (faellig am " + formatGameTime(item.dueMin) + ")" : ""));
  }
  if (items.length > 10) lines.push("... und " + (items.length - 10) + " weitere.");
  lines.push("");
  lines.push("Gesamt: " + formatEuroBackend(items.reduce((s, o) => s + o.remainingCents, 0)));
  lines.push("Firmenkonto: " + formatEuroBackend(state.company.accountCents));
  return lines.join("\n");
}

function preparePaymentsReport(state, m) {
  const items = (state.accounting?.openItems || []).filter(o => o.remainingCents > 0 && !item.paymentPrepared);
  const prepared = (state.accounting?.openItems || []).filter(o => o.paymentPrepared);
  const lines = ["Zahlungsuebersicht am " + formatGameTime(m) + ":"];
  lines.push("");
  if (items.length > 0) {
    lines.push("Noch nicht vorbereitet:");
    for (const item of items.slice(0, 10)) {
      lines.push("- " + (item.text || item.id) + ": " + formatEuroBackend(item.remainingCents));
    }
  }
  if (prepared.length > 0) {
    lines.push("");
    lines.push("Zur Zahlung vorbereitet:");
    for (const item of prepared.slice(0, 10)) {
      lines.push("- " + (item.text || item.id) + ": " + formatEuroBackend(item.remainingCents));
    }
  }
  lines.push("");
  lines.push("Firmenkonto: " + formatEuroBackend(state.company.accountCents));
  lines.push("Welche Zahlung soll ich ausfuehren?");
  return lines.join("\n");
}

function checkCleaningNeed(state, m) {
  const vehicles = state.vehicles || [];
  const lowCondition = vehicles.filter(v => v.condition < 50);
  const lines = ["Reinigungs- und Zustandsbericht am " + formatGameTime(m) + ":"];
  lines.push("");
  if (lowCondition.length === 0) {
    lines.push("Alle Lkw sind in ausreichendem Zustand. Kein zusaetzlicher Reinigungsbedarf.");
  } else {
    lines.push("Fahrzeuge mit niedrigem Zustand (Reinigung empfohlen):");
    for (const v of lowCondition) {
      lines.push("- Lkw " + v.id + " in " + v.locationCity + " - Zustand: " + v.condition + "/100");
    }
  }
  return lines.join("\n");
}

function organizeReplacement(state, task, m) {
  const lines = ["Ich habe die Vertretungsoptionen geprueft."];
  const freeDrivers = (state.drivers || []).filter(d => d.status === "free" && d.employmentStatus === "employed" && d.attendance === "present");
  if (freeDrivers.length > 0) {
    lines.push("");
    lines.push("Verfuegbare Fahrer als Vertretung:");
    for (const d of freeDrivers.slice(0, 5)) {
      lines.push("- " + d.name + " in " + d.locationCity);
    }
  } else {
    lines.push("");
    lines.push("Aktuell sind keine freien Fahrer als Vertretung verfuegbar. Soll ich einen neuen Fahrer vorschlagen?");
  }
  return lines.join("\n");
}

function formatEuroBackend(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const frac = abs % 100;
  return sign + euros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + String(frac).padStart(2, "0") + " EUR";
}