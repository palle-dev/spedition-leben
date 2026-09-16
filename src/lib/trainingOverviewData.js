// Berechnet die Weiterbildungs-Übersicht direkt aus dem Spielzustand.
// Ersatz für den Worker-Roundtrip (send "getTrainingOverview"), der
// hängen bleiben kann, wenn der Worker beschäftigt ist.

const DAY_MIN = 1440;
const BLOCK_MIN = 480;
const PROVIDER_SLOTS = 10;

function countUsedProviderSlots(state, fromMin, toMin) {
  const enrollments = (state.training?.enrollments) || [];
  let maxOverlap = 0;
  for (let t = fromMin; t < toMin; t += BLOCK_MIN) {
    const blockEnd = t + BLOCK_MIN;
    const count = enrollments.filter(e =>
      ["reserved", "in_progress"].includes(e.status) &&
      (e.blockStarts || []).some(bs => bs < blockEnd && bs + BLOCK_MIN > t)
    ).length;
    if (count > maxOverlap) maxOverlap = count;
  }
  return maxOverlap;
}

export function getTrainingOverview(state) {
  const training = state.training || { qualifications: [], enrollments: [], apprenticeships: [] };
  const enrollments = (training.enrollments || []).filter(e => ["reserved", "in_progress"].includes(e.status));
  const apprenticeships = (training.apprenticeships || []).filter(a => ["theory", "practice", "takeover_pending"].includes(a.status));

  const upcomingCompletions = [...enrollments, ...apprenticeships]
    .map(e => ({
      id: e.id,
      personId: e.personId,
      type: "enrollment" in e ? "course" : "apprenticeship",
      endMin: e.endMin || e.completionAtMin,
    }))
    .sort((a, b) => (a.endMin || 0) - (b.endMin || 0));

  const expiringSoon = (training.qualifications || [])
    .filter(q => q.status === "active" && q.validUntilMin)
    .map(q => ({
      ...q,
      daysLeft: Math.floor((q.validUntilMin - state.gameTime) / DAY_MIN),
    }))
    .filter(q => q.daysLeft <= 120)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const pendingTakeovers = apprenticeships.filter(a => a.status === "takeover_pending");

  return {
    activeEnrollments: enrollments.length,
    activeApprenticeships: apprenticeships.length,
    upcomingCompletions,
    expiringSoon,
    pendingTakeovers,
    providerSlotsUsed: countUsedProviderSlots(state, state.gameTime, state.gameTime + DAY_MIN),
    providerSlotsTotal: PROVIDER_SLOTS,
  };
}