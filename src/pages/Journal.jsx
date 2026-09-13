import React from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, euroSigned } from "@/lib/gameData";
import { BookOpen, Truck, Heart, Trophy, Package, Euro } from "lucide-react";
import { vehicleDisplayName } from "@/lib/displayHelpers";

export default function Journal() {
  const { state } = useGame();
  const events = [];

  state.bookings.forEach(b => events.push({ min: b.min, icon: "euro", text: `${b.cause} (${b.account === "company" ? "Firma" : "Privat"})`, amount: b.amountCents }));
  state.trips.forEach(t => {
    if (t.status === "completed") {
      const v = state.vehicles.find(x => x.id === t.vehicleId);
      const phases = t.phases || t.legs || [];
      const lastPhase = phases[phases.length - 1];
      events.push({ min: t.endMin, icon: "truck", text: `${vehicleDisplayName(v)} abgeschlossen in ${lastPhase?.toCity || "—"}` });
    }
  });
  state.appointments.forEach(a => {
    if (a.status === "done") events.push({ min: a.endMin, icon: "heart", text: `Termin beendet: ${labelOf(a)}` });
    if (a.status === "missed") events.push({ min: a.decisionDeadline, icon: "heart", text: `Einladung verpasst: ${labelOf(a)}` });
    if (a.status === "declined") events.push({ min: a.appearMin, icon: "heart", text: `Einladung abgesagt: ${labelOf(a)}` });
  });
  state.milestones.forEach(m => { if (m.achieved) events.push({ min: m.achievedAtMin, icon: "trophy", text: `Meilenstein erreicht: ${m.name}` }); });
  state.orders.forEach(o => {
    if (o.status === "geliefert") events.push({ min: o.deliveredAtMin, icon: "package", text: `Geliefert: ${o.customer} (${o.fromCity} → ${o.toCity})` });
    if (o.status === "expired") events.push({ min: o.acceptDeadlineMin, icon: "package", text: `Angebot verfallen: ${o.customer}` });
  });

  events.sort((a, b) => b.min - a.min);
  const recent = events.slice(0, 60);

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl lg:text-3xl font-medium tracking-tight flex items-center gap-2"><BookOpen className="w-6 h-6 text-lime/70" /> Ereignisjournal</h1>
        <p className="text-sm text-muted-foreground mt-1">Chronologischer Verlauf von Buchungen, Fahrten, Terminen und Meilensteinen.</p>
      </div>
      {recent.length === 0 ? <div className="text-sm text-muted-foreground/50">Noch keine Ereignisse.</div> : (
        <div className="space-y-0.5">
          {recent.map((e, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-white/5 py-2.5">
              <span className="text-muted-foreground/50 text-xs tabular-nums w-28 shrink-0">{formatGameTime(e.min)}</span>
              <IconFor kind={e.icon} />
              <span className="text-foreground/80 flex-1 text-sm">{e.text}</span>
              {e.amount != null && <span className={`tabular-nums text-sm shrink-0 ${e.amount >= 0 ? "text-lime" : "text-red-300"}`}>{euroSigned(e.amount)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function labelOf(a) {
  if (a.type === "invitation") return "Freizeitabend";
  if (a.type === "invitation_ersatz") return "Ersatztermin";
  if (a.type === "leisure") return a.label || "Freizeit";
  return "Termin";
}
function IconFor({ kind }) {
  const cls = "w-4 h-4 shrink-0";
  if (kind === "truck") return <Truck className={`${cls} text-lime/70`} />;
  if (kind === "heart") return <Heart className={`${cls} text-coral/70`} />;
  if (kind === "trophy") return <Trophy className={`${cls} text-amber-300`} />;
  if (kind === "package") return <Package className={`${cls} text-foreground/50`} />;
  return <Euro className={`${cls} text-lime/70`} />;
}