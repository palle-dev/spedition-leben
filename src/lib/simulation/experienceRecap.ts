// Bounded, deterministic counters; called once after event deduplication.
// No rewards, random draws, timers, or replay of historic saves.
export function recordExperienceEvent(state, event) {
 const day = Math.floor(event.gameTime / 1440) + 1;
 if (!Number.isFinite(day)) return;
 const data = state.experienceRecap ||= { version: 1, sinceMin: event.gameTime, days: {} };
 const latestDay = Math.floor(Math.max(state.gameTime, event.gameTime) / 1440) + 1;
 for (const key of Object.keys(data.days)) if (Number(key) < latestDay - 13) delete data.days[key];
 if (day < latestDay - 13) return;
 const row = data.days[day] ||= { deliveries: 0, onTime: 0, failed: 0, courses: 0, expansions: 0, appointmentsDone: 0, appointmentsMissed: 0, contractsWon: 0, contractsCompleted: 0 };
 switch (event.type) {
  case "delivery_completed": row.deliveries++; if (event.details.onTime === true) row.onTime++; break;
  case "order_failed": row.failed++; break;
  case "course_completed": row.courses++; break;
  case "expansion_completed": row.expansions++; break;
  case "personal_appointment_done": row.appointmentsDone++; break;
  case "personal_appointment_missed": row.appointmentsMissed++; break;
  case "contract_accepted": row.contractsWon++; break;
  case "contract_completed": row.contractsCompleted++; break;
 }
}
