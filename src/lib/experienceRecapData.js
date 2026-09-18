export function getDayRecap(state, day) {
 const today = Math.floor(state.gameTime / 1440) + 1;
 const data = state.experienceRecap;
 if (!data || !Number.isInteger(day) || day >= today || day < today - 13 || day < Math.floor(data.sinceMin / 1440) + 1) return null;
 const row = data.days[day] || {};
 const finance = state.accounting?.dailySummary?.[day];
 return { day, partial: data.sinceMin > (day - 1) * 1440,
  deliveries: row.deliveries || 0, onTime: row.onTime || 0, failed: row.failed || 0,
  courses: row.courses || 0, expansions: row.expansions || 0,
  appointmentsDone: row.appointmentsDone || 0, appointmentsMissed: row.appointmentsMissed || 0,
  contractsWon: row.contractsWon || 0, contractsCompleted: row.contractsCompleted || 0,
  revenue: finance?.revenue ?? null, expenses: finance?.expenses ?? null,
  result: finance ? finance.revenue - finance.expenses : null };
}
export function getUpcomingRiskCount(state) {
 return (state.orders || []).filter(o => ["angenommen", "unterwegs"].includes(o.status) && Number.isFinite(o.deliveryDeadlineMin) && o.deliveryDeadlineMin <= state.gameTime + 1440).length;
}
