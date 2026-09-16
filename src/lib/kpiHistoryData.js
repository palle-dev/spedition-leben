// Tägliche KPI-Historie aus Aufträgen und Weiterbildungs-Abschlüssen.
// Leitet Metriken direkt aus dem Spielzustand ab — keine Backend-Änderungen nötig.

import { COURSE_CATALOG, qualTypeLabel } from "./trainingData";

const DAY_MIN = 1440;

function dayOf(min) {
  return Math.floor(min / DAY_MIN);
}

// Tägliche KPI-Historie aus Aufträgen ableiten.
// Liefert ein Array von Tages-Buckets mit deliveries, failed, expired, revenue, accepted, successRate.
export function getKpiHistory(state, days = 30) {
  const today = dayOf(state.gameTime);
  const startDay = today - days + 1;
  const startMin = startDay * DAY_MIN;

  const buckets = new Map();
  for (let d = startDay; d <= today; d++) {
    buckets.set(d, { day: d, deliveries: 0, failed: 0, expired: 0, revenue: 0, accepted: 0 });
  }

  for (const o of (state.orders || [])) {
    if (o.status === "geliefert" && o.deliveredAtMin != null && o.deliveredAtMin >= startMin) {
      const b = buckets.get(dayOf(o.deliveredAtMin));
      if (b) { b.deliveries++; b.revenue += o.paidCents || 0; }
    } else if (o.status === "failed" && o.failedAtMin != null && o.failedAtMin >= startMin) {
      const b = buckets.get(dayOf(o.failedAtMin));
      if (b) b.failed++;
    } else if (o.status === "expired" && o.acceptDeadlineMin != null && o.acceptDeadlineMin >= startMin) {
      const b = buckets.get(dayOf(o.acceptDeadlineMin));
      if (b) b.expired++;
    }
    if (o.acceptedAtMin != null && o.acceptedAtMin >= startMin && o.status !== "offered") {
      const b = buckets.get(dayOf(o.acceptedAtMin));
      if (b) b.accepted++;
    }
  }

  const history = [];
  for (let d = startDay; d <= today; d++) {
    const b = buckets.get(d);
    const total = b.deliveries + b.failed + b.expired;
    const successRate = total > 0 ? b.deliveries / total : null;
    history.push({ ...b, total, successRate, dayLabel: `T${d}` });
  }
  return history;
}

// Weiterbildungs-Abschlüsse als Zeitachsen-Events.
export function getTrainingEvents(state, days = 30) {
  const today = dayOf(state.gameTime);
  const startMin = (today - days + 1) * DAY_MIN;
  const events = [];
  for (const q of (state.training?.qualifications || [])) {
    if (q.source !== "course" || q.acquiredAtMin == null || q.acquiredAtMin < startMin) continue;
    const person = (state.drivers || []).find(d => d.id === q.personId) || (state.employees || []).find(e => e.id === q.personId);
    const course = COURSE_CATALOG.find(c => c.effect === q.type);
    events.push({
      day: dayOf(q.acquiredAtMin),
      minute: q.acquiredAtMin,
      personName: person?.name || "Unbekannt",
      label: course?.label || qualTypeLabel(q.type),
    });
  }
  return events.sort((a, b) => a.minute - b.minute);
}

// Aggregierte KPIs für den gewählten Zeitraum.
export function getKpiSummary(history) {
  let deliveries = 0, failed = 0, expired = 0, revenue = 0, accepted = 0;
  for (const h of history) {
    deliveries += h.deliveries;
    failed += h.failed;
    expired += h.expired;
    revenue += h.revenue;
    accepted += h.accepted;
  }
  const total = deliveries + failed + expired;
  const successRate = total > 0 ? deliveries / total : 0;
  return { deliveries, failed, expired, revenue, accepted, total, successRate };
}

// KPI-Verlauf vor und nach einem Weiterbildungs-Abschluss vergleichen.
// Liefert für jedes Trainings-Event die Metriken 7 Tage davor und 7 Tage danach.
export function getTrainingImpact(state, events) {
  const history = getKpiHistory(state, 90);
  const byDay = new Map(history.map(h => [h.day, h]));

  return events.map(ev => {
    const before = [];
    const after = [];
    for (let offset = 7; offset >= 1; offset--) {
      const b = byDay.get(ev.day - offset);
      if (b) before.push(b);
    }
    for (let offset = 0; offset < 7; offset++) {
      const a = byDay.get(ev.day + offset);
      if (a) after.push(a);
    }
    const sumBefore = before.reduce((acc, b) => ({ del: acc.del + b.deliveries, fail: acc.fail + b.failed + b.expired }), { del: 0, fail: 0 });
    const sumAfter = after.reduce((acc, b) => ({ del: acc.del + b.deliveries, fail: acc.fail + b.failed + b.expired }), { del: 0, fail: 0 });
    const rateBefore = sumBefore.del + sumBefore.fail > 0 ? sumBefore.del / (sumBefore.del + sumBefore.fail) : 0;
    const rateAfter = sumAfter.del + sumAfter.fail > 0 ? sumAfter.del / (sumAfter.del + sumAfter.fail) : 0;
    return {
      ...ev,
      beforeDeliveries: sumBefore.del,
      afterDeliveries: sumAfter.del,
      beforeRate: rateBefore,
      afterRate: rateAfter,
      delta: rateAfter - rateBefore,
    };
  }).filter(ev => ev.beforeDeliveries > 0 || ev.afterDeliveries > 0);
}