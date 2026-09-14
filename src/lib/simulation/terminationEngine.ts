// Kündigungs-Engine für FERNWERK – Auftrag 18.
// Trennt Erklärung (Kündigung aussprechen) vom tatsächlichen Austritt (Fristende).
// Reine Logik – keine Auth, keine Speicherung. Wird von simulationEngine importiert.

import { NOTICE_PERIOD_MIN, formatGameTime, dayOf } from "./gameRules.ts";
import { deliverMessage } from "./mailEngine.ts";

// ---------- Hilfsfunktionen ----------

// Findet eine Person (Fahrer oder Angestellter) anhand der ID.
export function findPerson(state, personId) {
  const driver = (state.drivers || []).find(d => d.id === personId);
  if (driver) return { person: driver, kind: "driver" };
  const emp = (state.employees || []).find(e => e.id === personId);
  if (emp) return { person: emp, kind: "employee" };
  return null;
}

// Prüft, ob eine Person noch aktiv beschäftigt ist (employed oder notice_given).
export function isActivelyEmployed(person) {
  const s = person.employmentStatus;
  return s === "employed" || s === "notice_given";
}

// Ermittelt das vorgesehene Austrittsdatum unter Berücksichtigung laufender Fahrten.
export function computeExitMin(state, person, kind) {
  let exitMin = state.gameTime + NOTICE_PERIOD_MIN;
  if (kind === "driver" && person.status === "on_trip") {
    const trip = (state.trips || []).find(t => t.id === person.tripId && t.status === "in_progress");
    if (trip && trip.endMin > exitMin) exitMin = trip.endMin;
  }
  return exitMin;
}

// Berechnet die verbleibenden Lohnfälligkeiten bis zum Austritt.
// Der Tageslohn wird an jedem Mitternacht fällig. Wir zählen die Mitternachte
// von der aktuellen Spielzeit bis zum Austrittszeitpunkt.
export function computeRemainingWages(state, person) {
  const exitMin = person.exitMin || computeExitMin(state, person, person.kind || "employee");
  const now = state.gameTime;
  const dailyWage = person.costPerDayCents || 0;
  // Nächstes Mitternacht nach aktueller Zeit
  let nextMidnight = Math.floor(now / 1440) * 1440 + 1440;
  if (nextMidnight === now) nextMidnight = now + 1440; // Genau Mitternacht: nächste Fälligkeit ist +1440
  // Zähle Mitternachte bis einschließlich exitMin
  let count = 0;
  let m = nextMidnight;
  while (m <= exitMin) {
    count++;
    m += 1440;
  }
  // Wenn exitMin genau auf Mitternacht fällt, wird dieser Lohn noch fällig (bereits gezählt)
  return {
    wageCount: count,
    dailyWageCents: dailyWage,
    totalWageCents: count * dailyWage,
    exitMin,
  };
}

// Sammelt betroffene Aufgaben, Reservierungen und Zuständigkeiten.
export function collectAffectedItems(state, person, kind) {
  const items = [];
  if (kind === "driver") {
    // Laufende Fahrt
    const trip = (state.trips || []).find(t => t.id === person.tripId && t.status === "in_progress");
    if (trip) {
      items.push({ type: "active_trip", label: "Laufende Fahrt bis " + formatGameTime(trip.endMin), tripId: trip.id });
    }
    // Zukünftige angenommene Aufträge ohne Trip
    const assignedOrders = (state.orders || []).filter(o =>
      o.status === "angenommen" && o.plannedById === person.id
    );
    for (const o of assignedOrders) {
      items.push({ type: "planned_order", label: "Geplanter Auftrag " + o.id, orderId: o.id });
    }
  } else {
    // Disponent: zugewiesene Lkw, offene Vorschläge
    if (person.role === "dispatcher" || person.role === "dispatcher_senior") {
      const vehicles = (person.assignedVehicleIds || []).map(vid => (state.vehicles || []).find(v => v.id === vid)).filter(Boolean);
      for (const v of vehicles) {
        items.push({ type: "assigned_vehicle", label: "Betreuter Lkw " + v.id, vehicleId: v.id });
      }
      const pendingSuggestions = (person.suggestions || []).filter(s => s.status === "pending");
      for (const s of pendingSuggestions) {
        items.push({ type: "pending_suggestion", label: "Offener Vorschlag " + s.id, suggestionId: s.id });
      }
    }
    // Buchhaltung: offene Belege/Posten
    if (person.role === "accountant" || person.role === "accountant_senior") {
      const receipts = (state.accounting?.receipts || []).filter(r => r.status === "generated");
      if (receipts.length > 0) {
        items.push({ type: "open_receipts", label: receipts.length + " ungeprüfte Belege" });
      }
      const openItems = (state.accounting?.openItems || []).filter(o => o.remainingCents > 0 && !o.paymentPrepared);
      if (openItems.length > 0) {
        items.push({ type: "open_items", label: openItems.length + " offene Posten" });
      }
    }
  }
  return items;
}

// ---------- Vorschau ----------

export function previewTermination(state, personId) {
  const found = findPerson(state, personId);
  if (!found) throw new Error("Person nicht gefunden.");
  const { person, kind } = found;
  if (!isActivelyEmployed(person)) throw new Error("Diese Person ist nicht mehr aktiv beschäftigt.");
  if (person.employmentStatus === "notice_given") throw new Error("Für diese Person wurde bereits ein Austritt angekündigt.");

  const exitMin = computeExitMin(state, person, kind);
  const wages = computeRemainingWages({ ...state, gameTime: state.gameTime }, { ...person, exitMin });
  const affected = collectAffectedItems(state, person, kind);
  const onTrip = kind === "driver" && person.status === "on_trip";
  const canReleaseImmediately = !onTrip;

  return {
    personId,
    name: person.name,
    role: kind === "driver" ? "driver" : person.role,
    kind,
    portraitId: person.portraitId,
    employmentStatus: person.employmentStatus,
    attendance: person.attendance,
    dailyWageCents: person.costPerDayCents,
    exitMin,
    exitDateLabel: formatGameTime(exitMin),
    remainingWageCount: wages.wageCount,
    remainingWageCents: wages.totalWageCents,
    affectedItems: affected,
    onTrip,
    canReleaseImmediately,
    tripEndMin: onTrip ? (state.trips.find(t => t.id === person.tripId)?.endMin || null) : null,
  };
}

// ---------- Kündigung erklären ----------

export function terminateEmployee(state, { personId, mode }) {
  const found = findPerson(state, personId);
  if (!found) throw new Error("Person nicht gefunden.");
  const { person, kind } = found;
  if (!isActivelyEmployed(person)) throw new Error("Diese Person ist nicht mehr aktiv beschäftigt.");
  if (person.employmentStatus === "notice_given") throw new Error("Für diese Person wurde bereits ein Austritt angekündigt.");

  if (mode !== "continue_working" && mode !== "garden_leave") throw new Error("Ungültiger Ablauf-Modus.");

  const exitMin = computeExitMin(state, person, kind);

  person.employmentStatus = "notice_given";
  person.exitMin = exitMin;
  person.exitMode = mode;
  person.noticeDeclaredAtMin = state.gameTime;
  person.noticeDeclaredBy = "player";

  // Freistellung: sofort wenn frei, sonst nach Trip-Ende
  if (mode === "garden_leave") {
    if (kind === "driver" && person.status === "on_trip") {
      person.releaseAfterTrip = true; // Markierung: nach Trip-Ende freistellen
    } else {
      person.attendance = "released";
      if (kind === "driver") {
        // Fahrer nicht mehr für neue Touren verfügbar, aber Status bleibt konsistent
        if (person.status === "free") person.status = "free"; // bleibt free, aber attendance = released verhindert Zuweisung
      }
    }
  }

  // Disponent: bei Freistellung sofort keine neuen autonomen Aktionen
  if (kind === "employee" && mode === "garden_leave") {
    person.attendance = "released";
  }

  // Mail an GF
  const wages = computeRemainingWages(state, { ...person, exitMin });
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Kündigung ausgesprochen: " + person.name,
    body: `Das Arbeitsverhältnis von ${person.name} (${kind === "driver" ? "Fahrer" : person.role}) wurde zum ${formatGameTime(state.gameTime)} gekündigt.\n\nAblauf: ${mode === "garden_leave" ? "Freistellung" : "Weiterarbeit bis Fristende"}\nVorgesehenes Ende: ${formatGameTime(exitMin)}\nVerbleibende Lohnfälligkeiten: ${wages.wageCount} × ${(person.costPerDayCents / 100).toFixed(0)} € = ${(wages.totalWageCents / 100).toFixed(0)} €\n\nDie Lohnpflicht besteht bis zum tatsächlichen Austritt weiter.`,
    gameTime: state.gameTime, category: "personnel", priority: "high",
    linkedRefs: { type: "employee", id: personId }, dedupKey: `termination_declared:${personId}`,
  });

  return {
    ok: true, personId, exitMin, mode,
    exitDateLabel: formatGameTime(exitMin),
    remainingWageCount: wages.wageCount,
    remainingWageCents: wages.totalWageCents,
  };
}

// ---------- Kündigung zurücknehmen ----------

export function cancelTermination(state, { personId }) {
  const found = findPerson(state, personId);
  if (!found) throw new Error("Person nicht gefunden.");
  const { person, kind } = found;
  if (person.employmentStatus !== "notice_given") throw new Error("Für diese Person wurde kein Austritt angekündigt.");
  if (person.exitMin && state.gameTime >= person.exitMin) throw new Error("Der Austritt ist bereits wirksam geworden.");

  person.employmentStatus = "employed";
  person.exitMin = null;
  person.exitMode = null;
  person.noticeDeclaredAtMin = null;
  person.noticeDeclaredBy = null;
  person.releaseAfterTrip = false;
  if (person.attendance === "released") person.attendance = "present";

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Kündigung zurückgenommen: " + person.name,
    body: `Die Kündigung von ${person.name} wurde zurückgenommen. Das Arbeitsverhältnis wird fortgesetzt.`,
    gameTime: state.gameTime, category: "personnel", priority: "normal",
    linkedRefs: { type: "employee", id: personId }, dedupKey: `termination_cancelled:${personId}`,
  });

  return { ok: true, personId };
}

// ---------- Tatsächlicher Austritt (Ereignis bei exitMin) ----------

export function processEmployeeExit(state, m, log) {
  // Fahrer
  for (const d of (state.drivers || [])) {
    if (d.employmentStatus === "notice_given" && d.exitMin === m) {
      executeExit(state, d, "driver", m, log);
    }
  }
  // Angestellte
  for (const emp of (state.employees || [])) {
    if (emp.employmentStatus === "notice_given" && emp.exitMin === m) {
      executeExit(state, emp, "employee", m, log);
    }
  }
}

function executeExit(state, person, kind, m, log) {
  const name = person.name;
  const role = kind === "driver" ? "Fahrer" : person.role;

  // Disponent: Lkw-Zuweisungen und Vorschläge aufräumen
  if (kind === "employee" && (person.role === "dispatcher" || person.role === "dispatcher_senior")) {
    person.assignedVehicleIds = [];
    person.suggestions = [];
  }

  // Fahrer: Status auf "former" setzen, keine neuen Touren
  if (kind === "driver") {
    // Wenn noch auf Trip (sollte nicht, da exitMin nach Trip-Ende), Trip abschließen lassen
    person.status = "former";
  }

  person.employmentStatus = "former";
  person.actualExitMin = m;
  person.attendance = "former";

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Austritt wirksam: " + name,
    body: `Das Arbeitsverhältnis von ${name} (${role}) ist zum ${formatGameTime(m)} wirksam beendet.\n\nAb jetzt fallen keine weiteren Tageslöhne mehr an.\nEventuell offene Löhne aus der Zeit vor dem Austritt bleiben als Verbindlichkeit bestehen.\n\nHistorische Touren, Buchungen und Nachrichten bleiben unter derselben ID erhalten.`,
    gameTime: m, category: "personnel", priority: "high",
    linkedRefs: { type: "employee", id: person.id }, dedupKey: `exit_effective:${person.id}`,
  });

  log.push({ type: "employee_exit", person: person.id, name, role, kind, atMin: m });
}

// ---------- Freistellung nach Trip-Ende ----------

export function processReleaseAfterTrip(state, m, log) {
  for (const d of (state.drivers || [])) {
    if (d.releaseAfterTrip && d.employmentStatus === "notice_given" && d.status !== "on_trip") {
      d.releaseAfterTrip = false;
      d.attendance = "released";
      log.push({ type: "driver_released", driver: d.id, atMin: m });
    }
  }
}

// ---------- Fällige Austrittsereignisse für earliestEventAfter ----------

export function getTerminationExitEvents(state, t, maxMin) {
  const events = [];
  for (const d of (state.drivers || [])) {
    if (d.employmentStatus === "notice_given" && d.exitMin && d.exitMin > t && d.exitMin <= maxMin) {
      events.push(d.exitMin);
    }
  }
  for (const emp of (state.employees || [])) {
    if (emp.employmentStatus === "notice_given" && emp.exitMin && emp.exitMin > t && emp.exitMin <= maxMin) {
      events.push(emp.exitMin);
    }
  }
  return events;
}

// ---------- Migration ----------

export function migrateTermination(state) {
  for (const d of (state.drivers || [])) {
    if (!d.employmentStatus) d.employmentStatus = "employed";
    if (d.exitMin === undefined) d.exitMin = null;
    if (!d.exitMode) d.exitMode = null;
    if (d.noticeDeclaredAtMin === undefined) d.noticeDeclaredAtMin = null;
    if (!d.noticeDeclaredBy) d.noticeDeclaredBy = null;
    if (d.releaseAfterTrip === undefined) d.releaseAfterTrip = false;
    if (d.actualExitMin === undefined) d.actualExitMin = null;
  }
  for (const emp of (state.employees || [])) {
    if (!emp.employmentStatus) emp.employmentStatus = "employed";
    if (emp.exitMin === undefined) emp.exitMin = null;
    if (!emp.exitMode) emp.exitMode = null;
    if (emp.noticeDeclaredAtMin === undefined) emp.noticeDeclaredAtMin = null;
    if (!emp.noticeDeclaredBy) emp.noticeDeclaredBy = null;
    if (emp.actualExitMin === undefined) emp.actualExitMin = null;
  }
}