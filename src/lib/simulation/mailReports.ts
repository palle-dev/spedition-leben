// Berichtsgenerierung und Event-Hooks fuer FERNWERK Auftrag 13.
// Erstellt Nachrichten aus tatsaechlichen Spielereignissen und regelm. Berichten.

import { deliverMessage, getPersonInfo, ensureReportSchedule } from "./mailEngine.ts";
import {
  formatGameTime, dayOf, clockOf,
  PERSONNEL_ROLES, SERVICE_START_MIN, SERVICE_END_MIN,
} from "./gameRules.ts";

function formatEuro(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const frac = abs % 100;
  return sign + euros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + String(frac).padStart(2, "0") + " EUR";
}

function vehicleLabel(v) {
  if (!v) return "unbekannt";
  const n = parseInt(String(v.id).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? v.id : "Lkw " + String(n).padStart(2, "0");
}

// ---------- Berichtspl\u00e4ne verarbeiten ----------

export function processReportSchedules(state, m, log) {
  if (!state.mail?.reportSchedules) return;
  let generated = 0;
  for (const sched of state.mail.reportSchedules) {
    if (!sched.active) continue;
    if (m < sched.nextDueMin) continue;

    const emp = (state.employees || []).find(e => e.id === sched.employeeId);
    if (!emp || emp.employmentStatus !== "employed") {
      sched.active = false;
      continue;
    }

    // Verfuegbarkeit pruefen
    if (emp.attendance !== "present") {
      // Verschieben auf naechsten Dienstbeginn
      const dayStart = Math.floor(m / 1440) * 1440;
      sched.nextDueMin = dayStart + 1440 + SERVICE_START_MIN;
      continue;
    }

    const clock = m % 1440;
    if (clock < SERVICE_START_MIN || clock > SERVICE_END_MIN) {
      // Ausserhalb Dienstzeit: verschieben
      const dayStart = Math.floor(m / 1440) * 1440;
      if (clock < SERVICE_START_MIN) {
        sched.nextDueMin = dayStart + SERVICE_START_MIN;
      } else {
        sched.nextDueMin = dayStart + 1440 + SERVICE_START_MIN;
      }
      continue;
    }

    const isDispatcher = emp.role === "dispatcher" || emp.role === "dispatcher_senior";
    const isAccountant = emp.role === "accountant" || emp.role === "accountant_senior";

    if (isDispatcher) {
      generateDispatcherReport(state, emp, sched.reportType, m);
      generated++;
      // Naechsten Bericht setzen
      if (sched.reportType === "morning") {
        sched.reportType = "evening";
        sched.nextDueMin = Math.floor(m / 1440) * 1440 + SERVICE_END_MIN;
      } else {
        sched.reportType = "morning";
        sched.nextDueMin = Math.floor(m / 1440) * 1440 + 1440 + SERVICE_START_MIN;
      }
    } else if (isAccountant) {
      generateAccountingReport(state, emp, sched.reportType, m);
      generated++;
      if (sched.reportType === "morning") {
        sched.reportType = "evening";
        sched.nextDueMin = Math.floor(m / 1440) * 1440 + SERVICE_END_MIN;
      } else {
        sched.reportType = "morning";
        sched.nextDueMin = Math.floor(m / 1440) * 1440 + 1440 + SERVICE_START_MIN;
      }
    }

    sched.lastProcessedMin = m;
  }
  if (generated > 0) log.push({ type: "reports_generated", count: generated, atMin: m });
}

// ---------- Dispatcher-Berichte ----------

function generateDispatcherReport(state, emp, reportType, m) {
  const assignedVehicles = (emp.assignedVehicleIds || []).map(vid => state.vehicles.find(v => v.id === vid)).filter(Boolean);
  const free = assignedVehicles.filter(v => v.status === "free");
  const onTrip = assignedVehicles.filter(v => v.status === "on_trip");
  const maintenance = assignedVehicles.filter(v => v.status === "maintenance");
  const accepted = state.orders.filter(o => o.status === "angenommen");
  const pendingSugs = (emp.suggestions || []).filter(s => s.status === "pending");
  const running = state.trips.filter(t => t.status === "in_progress" && assignedVehicles.some(v => v.id === t.vehicleId));

  const lines = [];
  const isMorning = reportType === "morning";
  const subject = (isMorning ? "Morgenbericht" : "Tagesbericht") + " - " + formatGameTime(m);

  lines.push("Hallo, hier ist " + emp.name + " mit dem " + (isMorning ? "Morgen" : "Tages") + "bericht.");
  lines.push("");
  lines.push("Betreute Flotte: " + assignedVehicles.length + " Lkw");
  lines.push("- Frei: " + free.length);
  lines.push("- Unterwegs: " + onTrip.length);
  lines.push("- Wartung: " + maintenance.length);
  lines.push("");
  lines.push("Angenommene Auftraege: " + accepted.length);
  if (accepted.length > 0) {
    for (const o of accepted.slice(0, 5)) {
      lines.push("  - " + o.id + ": " + o.customer + " (" + o.fromCity + " -> " + o.toCity + ")");
    }
  }
  lines.push("");
  lines.push("Laufende Touren: " + running.length);
  lines.push("Offene Vorschlaege: " + pendingSugs.length);
  lines.push("Delegationsmodus: " + workModeText(emp.workMode));

  if (!isMorning) {
    // Tagesbericht: Kennzahlen
    const stats = emp.dailyStats || { offersChecked: 0, ordersAccepted: 0, ordersPlanned: 0, toursStarted: 0 };
    lines.push("");
    lines.push("Kennzahlen heute:");
    lines.push("- Angebote geprueft: " + (stats.offersChecked || 0));
    lines.push("- Auftraege angenommen: " + (stats.ordersAccepted || 0));
    lines.push("- Auftraege geplant: " + (stats.ordersPlanned || 0));
    lines.push("- Touren gestartet: " + (stats.toursStarted || 0));
  }

  // Probleme
  const problems = [];
  if (maintenance.length > 0) problems.push(maintenance.length + " Lkw in Wartung");
  const sickDrivers = (state.drivers || []).filter(d => d.attendance === "sick" && assignedVehicles.some(v => v.tripId && state.trips.find(t => t.id === v.tripId && t.driverId === d.id)));
  if (sickDrivers.length > 0) problems.push(sickDrivers.length + " Fahrer krank");
  if (state.company.accountCents < 500000) problems.push("Firmenreserve gering (" + formatEuro(state.company.accountCents) + ")");
  if (problems.length > 0) {
    lines.push("");
    lines.push("Probleme: " + problems.join(", "));
  }

  if (emp.workMode === "suggestions" && pendingSugs.length > 0) {
    lines.push("");
    lines.push(pendingSugs.length + " Vorschlaege warten auf Deine Freigabe.");
  }

  deliverMessage(state, {
    fromId: emp.id, toId: "player",
    subject, body: lines.join("\n"),
    gameTime: m, category: "dispatch", priority: "normal",
    sourceEvent: "report_dispatcher_" + reportType,
    dedupKey: "report_dispatcher_" + reportType + ":" + emp.id + ":" + dayOf(m),
    linkedRefs: assignedVehicles.slice(0, 3).map(v => ({ type: "vehicle", id: v.id })),
  });
}

function workModeText(mode) {
  if (mode === "suggestions") return "Vorschlaege vorbereiten - Deine Freigabe erforderlich";
  if (mode === "dispatch_accepted") return "Plant angenommene Auftraege - nimmt keine neuen Angebote an";
  if (mode === "autonomous") return "Nimmt passende Auftraege selbst an und plant sie";
  return mode || "unbekannt";
}

// ---------- Fahrer-Lieferbericht ----------

export function generateDriverDeliveryReport(state, driver, trip, order, m) {
  if (!driver || !order) return;
  const onTime = trip.endMin <= order.deliveryDeadlineMin;
  const payment = order.paidCents || trip.paymentCents;
  const restUntil = driver.restUntil;

  const lines = [];
  lines.push("Lieferung abgeschlossen: " + order.customer);
  lines.push("Auftrag " + order.id + ": " + order.fromCity + " -> " + order.toCity + " (" + order.cargo + ", " + order.tons + " t)");
  lines.push("Ankunft: " + formatGameTime(trip.endMin));
  lines.push(onTime ? "Lieferung rechtzeitig." : "Lieferung verspaetet - Verguetung gekuerzt.");
  lines.push("Verguetung: " + formatEuro(payment));
  lines.push("Fahrzeug: " + vehicleLabel(state.vehicles.find(v => v.id === trip.vehicleId)));
  if (restUntil) {
    lines.push("Ich bin nach der Erholung ab " + formatGameTime(restUntil) + " wieder verfuegbar.");
  }
  lines.push("");
  lines.push("Diese Meldung wurde automatisch beim Lieferabschluss erstellt.");

  deliverMessage(state, {
    fromId: driver.id, toId: "player",
    subject: "Lieferung abgeschlossen: " + order.customer + " (" + order.id + ")",
    body: lines.join("\n"),
    gameTime: m, category: "dispatch", priority: "normal",
    sourceEvent: "delivery_report",
    dedupKey: "delivery_report:" + trip.id + ":" + driver.id,
    linkedRefs: [{ type: "order", id: order.id }, { type: "trip", id: trip.id }],
  });
}

// ---------- Buchhaltungs-Berichte ----------

function generateAccountingReport(state, emp, reportType, m) {
  const openItems = (state.accounting?.openItems || []).filter(o => o.remainingCents > 0);
  const receipts = (state.accounting?.receipts || []);
  const uncheckedReceipts = receipts.filter(r => r.status === "generated");
  const preparedPayments = openItems.filter(o => o.paymentPrepared);

  const lines = [];
  const isMorning = reportType === "morning";
  const subject = "Buchhaltung " + (isMorning ? "Morgen" : "Tages") + "bericht - " + formatGameTime(m);

  lines.push("Hallo, hier ist " + emp.name + " aus der Buchhaltung mit dem " + (isMorning ? "Morgen" : "Tages") + "bericht.");
  lines.push("");
  lines.push("Firmenkonto: " + formatEuro(state.company.accountCents));
  lines.push("");

  if (isMorning) {
    lines.push("Bekannte faellige Posten: " + openItems.length);
    if (openItems.length > 0) {
      lines.push("Gesamt offen: " + formatEuro(openItems.reduce((s, o) => s + o.remainingCents, 0)));
    }
    lines.push("Ungepruefte Belege: " + uncheckedReceipts.length);
    lines.push("");
    if (openItems.length > 0) {
      lines.push("Bitte pruefe, welche Zahlungen ich vorbereiten soll.");
    } else {
      lines.push("Keine offenen Posten - alles auf dem neuesten Stand.");
    }
  } else {
    const stats = emp.dailyStats || { receiptsChecked: 0, paymentsPrepared: 0, paymentsExecuted: 0 };
    lines.push("Kennzahlen heute:");
    lines.push("- Belege geprueft: " + (stats.receiptsChecked || 0));
    lines.push("- Zahlungen vorbereitet: " + (stats.paymentsPrepared || 0));
    lines.push("- Zahlungen ausgefuehrt: " + (stats.paymentsExecuted || 0));
    lines.push("");
    lines.push("Verbleibend:");
    lines.push("- Offene Posten: " + openItems.length);
    lines.push("- Ungepruefte Belege: " + uncheckedReceipts.length);
    lines.push("- Zur Zahlung vorbereitet: " + preparedPayments.length);
  }

  deliverMessage(state, {
    fromId: emp.id, toId: "player",
    subject, body: lines.join("\n"),
    gameTime: m, category: "accounting", priority: "normal",
    sourceEvent: "report_accounting_" + reportType,
    dedupKey: "report_accounting_" + reportType + ":" + emp.id + ":" + dayOf(m),
  });
}

// ---------- Mitarbeiter-Einfuehrung ----------

export function generateEmployeeIntroduction(state, emp, m) {
  const roleLabel = PERSONNEL_ROLES[emp.role]?.label || emp.role;
  const lines = [];
  lines.push("Guten Tag, ich bin " + emp.name + " und ab heute als " + roleLabel + " im Einsatz.");
  lines.push("");
  lines.push("Meine Dienstzeit ist von 08:00 bis 16:00 Uhr.");
  if (emp.role === "dispatcher" || emp.role === "dispatcher_senior") {
    lines.push("Bitte weise mir Lkw und Befugnisse zu, damit ich mit der Disposition beginnen kann.");
    lines.push("Aktuell arbeite ich im Modus 'Vorschlaege vorbereiten' - ich nehme keine Auftraege selbststaendig an, bis Du meine Befugnisse aenderst.");
  } else if (emp.role === "accountant" || emp.role === "accountant_senior") {
    lines.push("Ich kuemmere mich um Belegpruefung, Zahlungsvorbereitung und den Periodenabschluss.");
  } else if (emp.role === "cleaner") {
    lines.push("Ich uebernehme die Reinigung der Fahrzeuge am Standort.");
  } else if (emp.role === "mechanic") {
    lines.push("Ich bin fuer Wartung und Reparaturen in der Werkstatt zustaendig.");
  }
  lines.push("");
  lines.push("Bei Fragen kannst Du mir jederzeit schreiben.");

  deliverMessage(state, {
    fromId: emp.id, toId: "player",
    subject: "Vorstellung: " + emp.name + " (" + roleLabel + ")",
    body: lines.join("\n"),
    gameTime: m, category: "personnel", priority: "normal",
    sourceEvent: "employee_introduction",
    dedupKey: "employee_intro:" + emp.id,
    linkedRefs: [{ type: "employee", id: emp.id }],
  });

  // Berichtsplan anlegen
  ensureReportSchedule(state, emp);
}

// ---------- Event-Hooks ----------

export function onOrderAccepted(state, order, acceptedById, m) {
  // Deaktiviert: Tour-Annahme-Benachrichtigungen werden nicht mehr als Mail versendet.
  return;
}

export function onTourConfirmed(state, tour, confirmedById, m) {
  // Deaktiviert: Tour-Planungs-Benachrichtigungen werden nicht mehr als Mail versendet.
  return;
}

export function onEmployeeHired(state, emp, m) {
  if (!emp) return;
  generateEmployeeIntroduction(state, emp, m);
}

export function onMaintenanceCompleted(state, vehicle, m) {
  if (!vehicle) return;
  const lines = [];
  lines.push("Die Wartung von " + vehicleLabel(vehicle) + " ist abgeschlossen.");
  lines.push("Fahrzeugzustand: 100/100");
  lines.push("Standort: " + vehicle.locationCity);
  lines.push("");
  lines.push("Der Lkw ist wieder einsatzbereit.");

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Wartung abgeschlossen: " + vehicleLabel(vehicle),
    body: lines.join("\n"),
    gameTime: m, category: "fleet", priority: "normal",
    sourceEvent: "maintenance_completed",
    dedupKey: "maintenance_completed:" + vehicle.id + ":" + m,
    linkedRefs: [{ type: "vehicle", id: vehicle.id }],
  });
}

// ---------- T\u00e4gliche Statistik zuruecksetzen ----------

export function resetDailyStats(state, m) {
  const day = dayOf(m);
  for (const emp of state.employees || []) {
    if (!emp.dailyStats || emp.dailyStats.day !== day) {
      emp.dailyStats = {
        day: day,
        offersChecked: 0,
        offersCheckedIds: [],
        ordersAccepted: 0,
        ordersPlanned: 0,
        toursStarted: 0,
        openQueries: 0,
        receiptsChecked: 0,
        paymentsPrepared: 0,
        paymentsExecuted: 0,
      };
    }
  }
}