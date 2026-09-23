// Sammelt alle ausstehenden Entscheidungen aus dem Spielzustand,
// die aktuell per E-Mail an den Spieler gehen und manuelle Freigabe erfordern.

import { formatGameTime } from "@/lib/gameData";

// Liefert alle offenen Entscheidungen sortiert nach Alter (älteste zuerst).
export function getPendingDecisions(state) {
  if (!state) return [];
  const decisions = [];

  // Filialanfragen werden ausschließlich im Telefon entschieden.
  // 2. Urlaubsanträge
  for (const r of (state.absences?.vacationRequests || [])) {
    if (r.status !== "pending") continue;
    decisions.push({
      key: "vacation_" + r.id,
      type: "vacation_request",
      id: r.id,
      title: "Urlaubsantrag",
      description: `${r.personName} beantragt Urlaub vom ${formatGameTime(r.startMin)} bis ${formatGameTime(r.endMin - 1)} (${r.days} Tag(e)).`,
      source: r.personName,
      location: "",
      createdAt: r.createdAtMin || r.startMin,
      costCents: 0,
      benefitDesc: "",
      meta: r,
      actions: [
        { label: "Genehmigen", command: "approveVacation", params: { requestId: r.id }, kind: "approve" },
        { label: "Ablehnen", command: "rejectVacation", params: { requestId: r.id, reason: "" }, kind: "reject" },
      ],
    });
  }

  // Nach Erstellungszeit sortieren (älteste zuerst)
  decisions.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return decisions;
}