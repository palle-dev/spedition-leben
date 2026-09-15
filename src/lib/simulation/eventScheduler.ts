// Extrahiert aus simulationEngine.ts: Berechnet das nächste Simulations-Ereignis.
// Reine Lesefunktion — verändert keinen Zustand.

import {
  SERVICE_START_MIN, SERVICE_END_MIN, SERVICE_INTERVAL_MIN,
} from "./gameRules.ts";
import { MONTH_MIN } from "./accountingEngine.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";
import { getFinancingDueEvents } from "./financingEngine.ts";
import { getTerminationExitEvents } from "./terminationEngine.ts";
import { getWorkshopEventTimes } from "./workshopEngine.ts";
import { getNextRegularWaveTime } from "./personnelMarketEngine.ts";
import { getTrainingEventTimes } from "./trainingEngine.ts";
import {
  getTankCleaningEventTimes, getEquipmentJobEventTimes, getInspectionJobEventTimes,
} from "./dangerousGoodsEngine.ts";
import { getInvestmentEventTimes } from "./investmentEngine.ts";
import { getDriverTravelEventTimes } from "./branchEngine.ts";
import { getPregnancyEventTimes } from "./relationshipEngine.ts";
import { getDateEventTimes } from "./datingEngine.ts";

export function earliestEventAfter(state, t, maxMin) {
  let best = null;
  const cand = (m) => { if (m > t && m <= maxMin) { if (best === null || m < best) best = m; } };
  for (const trip of state.trips) {
    if (trip.status === "in_progress" && trip.currentPhase < (trip.phases || []).length) cand(trip.phases[trip.currentPhase].endMin);
  }
  for (const a of state.appointments) {
    if (a.status === "pending") cand(a.decisionDeadline);
    else if (a.status === "accepted") { cand(a.startMin); cand(a.endMin); }
    else if (a.status === "active") cand(a.endMin);
  }
  cand(Math.floor(t / 1440) * 1440 + 1440); // nächste Mitternacht
  cand(Math.floor(t / 60) * 60 + 60); // nächste Marktwelle (volle Stunde)
  cand(Math.floor(t / MONTH_MIN) * MONTH_MIN + MONTH_MIN); // nächste Monatsgrenze
  for (const o of state.orders) { if (o.status === "offered") cand(o.acceptDeadlineMin); }
  if (!state.tutorialInviteCreated) cand(720);
  for (const d of state.drivers) { if (d.status === "resting" && d.restUntil !== null) cand(d.restUntil); }
  for (const v of state.vehicles) { if (v.status === "maintenance" && v.maintenanceUntil !== null) cand(v.maintenanceUntil); }
  // Dienstzeiten für Angestellte (Buchhaltung/Reinigung tagsüber, Disponenten Schicht-basiert)
  const hasNonDriverStaff = (state.employees || []).some(e => e.employmentStatus === "employed" && e.attendance === "present" && e.role !== "driver");
  if (hasNonDriverStaff) {
    const dayStart = Math.floor(t / 1440) * 1440;
    // Performance: Union-Set für alle Disponenten-Schichtzeiten, statt pro
    // Disponent einzeln zu iterieren. Reduziert O(dispatchers × shift_hours × 2)
    // auf O(unique_shift_hours × 2) — bei vielen Disponenten ein Vielfaches.
    const shiftTimes = new Set();
    let hasDispatcher = false;
    for (const emp of (state.employees || [])) {
      if (emp.role !== "dispatcher" && emp.role !== "dispatcher_senior") continue;
      if (!isActivelyEmployed(emp) || emp.attendance !== "present") continue;
      hasDispatcher = true;
      const sStart = emp.shiftStart ?? SERVICE_START_MIN;
      const sEnd = emp.shiftEnd ?? SERVICE_END_MIN;
      for (let day = 0; day <= 1; day++) {
        const base = dayStart + day * 1440;
        if (sStart <= sEnd) {
          for (let st = base + sStart; st <= base + sEnd; st += SERVICE_INTERVAL_MIN) shiftTimes.add(st);
        } else {
          for (let st = base + sStart; st < base + 1440; st += SERVICE_INTERVAL_MIN) shiftTimes.add(st);
          for (let st = base; st <= base + sEnd; st += SERVICE_INTERVAL_MIN) shiftTimes.add(st);
        }
      }
    }
    // Buchhaltung, Reinigung etc.: feste Dienstzeiten 08:00–16:00
    for (let st = dayStart + SERVICE_START_MIN; st <= dayStart + SERVICE_END_MIN; st += SERVICE_INTERVAL_MIN) {
      cand(st);
    }
    // Disponenten: vereinigte Schichtzeiten
    if (hasDispatcher) {
      for (const st of shiftTimes) cand(st);
    }
    // Ereignisgesteuerte Dispositionsplanung (triggerDispatcherPlanning):
    // processEventsAt ruft triggerDispatcherPlanning alle 15 Min auf
    // (m % 15 === 0). Ohne diese Tick-Marken würde der Ereignis-Loop
    // zwischen zwei vollen Stunden keine 15/30/45-Minuten-Marke ansteuern,
    // sodass autonome Disponenten nicht regelmäßig planen und Aufträge
    // liegen bleiben — der Umsatz pro Tag bleibt zu gering.
    // Nur erzeugen, wenn ein autonomer/dispatch_accepted Disponent
    // vorhanden ist (sonst ist triggerDispatcherPlanning ein No-Op).
    const hasAutoDispatcher = (state.employees || []).some(e =>
      isActivelyEmployed(e) && e.attendance === "present" &&
      (e.role === "dispatcher" || e.role === "dispatcher_senior") &&
      (e.workMode === "autonomous" || e.workMode === "dispatch_accepted")
    );
    if (hasAutoDispatcher) {
      const next15 = Math.ceil((t + 1) / 15) * 15;
      cand(next15);
    }
  }
  // Tour-Deployment-Startzeiten
  for (const tour of state.tours || []) {
    if (tour.status !== "active") continue;
    for (const dep of tour.deployments) {
      if (dep.status === "planned") cand(dep.startMin);
    }
    if (tour.returnDeployment && tour.returnDeployment.status === "planned") cand(tour.returnDeployment.startMin);
  }
  // Staff-Task-Verarbeitungszeiten (Postfach)
  for (const task of (state.mail?.staffTasks || [])) {
    if (task.status === "pending") cand(task.earliestProcessMin);
  }
  // Finanzierungs-Fälligkeiten (Kredite, Leasing) – Auftrag 17
  for (const dueMin of getFinancingDueEvents(state, t, maxMin)) cand(dueMin);
  // Kündigungs-Austritte (Auftrag 18)
  for (const dueMin of getTerminationExitEvents(state, t, maxMin)) cand(dueMin);
  // Dienstleistungsverträge (Auftrag 25) – nur bei vorhandenen Verträgen
  if ((state.serviceContracts || []).length > 0) {
    for (const c of state.serviceContracts) {
      if (c.status === "planned") cand(c.startMin);
      if (c.status === "active" || c.status === "planned") cand(c.endMin);
    }
  }
  // Krankheitsenden (Auftrag 25) – nur bei aktiven Krankmeldungen
  if ((state.absences?.sicknesses || []).length > 0) {
    for (const s of state.absences.sicknesses) { if (s.status === "active") cand(s.expectedEndMin); }
  }
  // Urlaubsbeginn und -ende (Auftrag 25) – nur bei genehmigten Anträgen
  if ((state.absences?.vacationRequests || []).length > 0) {
    for (const r of state.absences.vacationRequests) { if (r.status === "approved") { cand(r.startMin); cand(r.endMin); } }
  }
  // Werkstatt-Ereignisse (Auftrag 27)
  for (const wt of getWorkshopEventTimes(state, t, maxMin)) cand(wt);
  // Personalmarkt-Wellen (Auftrag 29): regulär 08:00/14:00, bedarfsbezogen
  {
    const nextReg = getNextRegularWaveTime(t);
    if (nextReg <= maxMin) cand(nextReg);
    const nextDemand = state.personnelMarket?.nextDemandWaveMin;
    if (nextDemand && nextDemand > t && nextDemand <= maxMin) cand(nextDemand);
  }
  // Gespräche (Auftrag 30): active conversation appointments werden bereits
  // durch die appointments-Schleife oben abgedeckt (status === "active" → cand(endMin)).
  // Aus- und Weiterbildung (Auftrag 31): Kursblöcke, Ausbildungen, Ablauf
  for (const tm of getTrainingEventTimes(state, t, maxMin)) cand(tm);
  // Gefahrgut (Auftrag 32): Tankreinigung, Ausrüstung, Spielprüfung
  for (const tm of getTankCleaningEventTimes(state, t, maxMin)) cand(tm);
  for (const tm of getEquipmentJobEventTimes(state, t, maxMin)) cand(tm);
  for (const tm of getInspectionJobEventTimes(state, t, maxMin)) cand(tm);
  // Investment: Order-Ablaufzeiten (Auftrag 33)
  if (state.investment?.market) {
    for (const tm of getInvestmentEventTimes(state, t, maxMin)) cand(tm);
  }
  // Fahrer-Reisen (Filialverschiebung)
  for (const tm of getDriverTravelEventTimes(state, t, maxMin)) cand(tm);
  for (const tm of [...getPregnancyEventTimes(state, t, maxMin), ...getDateEventTimes(state, t, maxMin)]) cand(tm);
  return best;
}