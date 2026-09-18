// Tägliche Finanz-Zeitreihen aus der Tageszusammenfassung der Buchhaltung.
// Nutzt state.accounting.dailySummary (kompakt, ein Eintrag pro Tag, nie
// abgeschnitten) anstelle des Journals, das auf 14 Tage begrenzt ist.

// Berechnet tägliche Einnahmen/Ausgaben für die letzten `days` Spieldays.
// Nutzt die kompakte Tageszusammenfassung (dailySummary), die nie abgeschnitten
// wird — im Gegensatz zum Journal, das auf 14 Tage begrenzt ist.
export function getDailyFinancialSeries(state, days) {
  const dailySummary = state?.accounting?.dailySummary || {};
  const currentDay = Math.floor((state?.gameTime || 0) / 1440) + 1;
  const startDay = Math.max(1, currentDay - days + 1);

  const series = [];
  for (let d = startDay; d <= currentDay; d++) {
    const s = dailySummary[d] || { revenue: 0, expenses: 0, directCosts: 0, personnel: 0, operations: 0, depreciation: 0, finance: 0 };
    series.push({
      day: d,
      dayLabel: `T${d}`,
      revenue: s.revenue || 0,
      expenses: s.expenses || 0,
      profit: 0,
      cumulativeProfit: 0,
      profitAvg7: 0,
      directCosts: s.directCosts || 0,
      personnel: s.personnel || 0,
      operations: s.operations || 0,
      depreciation: s.depreciation || 0,
      finance: s.finance || 0,
    });
  }
  let cumulative = 0;
  for (let i = 0; i < series.length; i++) {
    const b = series[i];
    b.profit = b.revenue - b.expenses;
    cumulative += b.profit;
    b.cumulativeProfit = cumulative;
    // 7-Tage-Schnitt des Tagesgewinns
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - 6); j <= i; j++) { sum += series[j].profit; count++; }
    b.profitAvg7 = Math.round(sum / count);
  }
  return series;
}

// KPIs für den gewählten Zeitraum.
export function getFinancialTrendKPIs(series) {
  let totalRevenue = 0, totalExpenses = 0;
  let bestDay = null, worstDay = null;
  for (const s of series) {
    totalRevenue += s.revenue;
    totalExpenses += s.expenses;
    if (!bestDay || s.profit > bestDay.profit) bestDay = s;
    if (!worstDay || s.profit < worstDay.profit) worstDay = s;
  }
  const netProfit = totalRevenue - totalExpenses;
  const margin = totalRevenue > 0 ? Math.round(netProfit / totalRevenue * 100) : 0;
  const count = series.length || 1;
  return {
    totalRevenue, totalExpenses, netProfit, margin,
    avgDailyRevenue: Math.round(totalRevenue / count),
    avgDailyExpenses: Math.round(totalExpenses / count),
    avgDailyProfit: Math.round(netProfit / count),
    bestDay, worstDay, dayCount: series.length,
  };
}

// Trend-Richtung: vergleicht Durchschnitt der ersten mit der zweiten Hälfte.
export function getProfitTrendDirection(series) {
  if (series.length < 4) return { direction: "neutral", label: "Zu wenig Daten", diffCents: 0 };
  const half = Math.floor(series.length / 2);
  const firstAvg = series.slice(0, half).reduce((s, d) => s + d.profit, 0) / half;
  const secondLen = series.length - half;
  const secondAvg = series.slice(half).reduce((s, d) => s + d.profit, 0) / secondLen;
  const diff = Math.round(secondAvg - firstAvg);
  const threshold = Math.max(5000, Math.abs(firstAvg) * 0.1);
  if (diff > threshold) return { direction: "up", label: "Verbessernd", diffCents: diff };
  if (diff < -threshold) return { direction: "down", label: "Verschlechternd", diffCents: diff };
  return { direction: "stable", label: "Stabil", diffCents: diff };
}

// Summen pro Kostenkategorie im Zeitraum.
export function getExpenseCategoryTotals(series) {
  const totals = { directCosts: 0, personnel: 0, operations: 0, depreciation: 0, finance: 0 };
  for (const s of series) {
    totals.directCosts += s.directCosts;
    totals.personnel += s.personnel;
    totals.operations += s.operations;
    totals.depreciation += s.depreciation;
    totals.finance += s.finance;
  }
  return totals;
}