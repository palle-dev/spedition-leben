import { getDistance } from './gameRules.ts';

// Only valid during one read-only suggestTours call. Filtering a stable total
// ordering keeps exactly the same ranking as sorting the eligible subset.
export function createPlanningOrderRanking(pool) {
  const byCity = new Map();
  const positionsByCity = new Map();
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
    // For sparse subsets, sorting their cached total ranks avoids scanning the
    // entire pool. Keep the dense scan for large subsets. Scoped to this call.
    if (eligible.length * Math.log2(eligible.length) < ranked.length) {
      let positions = positionsByCity.get(city);
      if (!positions) {
        positions = new Map(ranked.map((o, i) => [o, i]));
        positionsByCity.set(city, positions);
      }
      if (positions.size === ranked.length) {
        const subset = [...new Set(eligible)].filter(o => positions.has(o));
        subset.sort((a, b) => positions.get(a) - positions.get(b));
        return subset.slice(0, limit);
      }
    }
    const selected = new Set(eligible), result = [];
    for (const o of ranked) {
      if (!selected.has(o)) continue;
      result.push(o);
      if (result.length >= limit) break;
    }
    return result;
  };
}
