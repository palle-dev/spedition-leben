import { getDistance } from './gameRules.ts';

// Only valid during one read-only suggestTours call. Filtering a stable total
// ordering keeps exactly the same ranking as sorting the eligible subset.
export function createPlanningOrderRanking(pool) {
  const byCity = new Map();
  const score = (o, city) => {
    const km = (getDistance(city, o.fromCity) + getDistance(o.fromCity, o.toCity)) || 1;
    return { o, score: (o.paymentCents || 0) / km };
  };
  const compare = (a, b) => {
    const aa = a.o.status === 'angenommen', ba = b.o.status === 'angenommen';
    if (aa !== ba) return aa ? -1 : 1;
    if (aa && a.o.deliveryDeadlineMin !== b.o.deliveryDeadlineMin) return a.o.deliveryDeadlineMin - b.o.deliveryDeadlineMin;
    return b.score - a.score;
  };
  return (eligible, city, limit) => {
    if (eligible.length <= limit) return eligible;
    if (!byCity.has(city)) {
      const scored = pool.map(o => score(o, city));
      // Nonfinite comparison keys need the original subset sort: sorting the
      // whole pool could change JS's treatment of a non-transitive comparator.
      const safe = scored.every(s => Number.isFinite(s.score) &&
        (s.o.status !== 'angenommen' || Number.isFinite(s.o.deliveryDeadlineMin)));
      byCity.set(city, safe ? scored.sort(compare).map(s => s.o) : null);
    }
    const ranked = byCity.get(city);
    if (!ranked) return eligible.map(o => score(o, city)).sort(compare).slice(0, limit).map(s => s.o);
    const selected = new Set(eligible), result = [];
    for (const o of ranked) {
      if (!selected.has(o)) continue;
      result.push(o);
      if (result.length >= limit) break;
    }
    return result;
  };
}
