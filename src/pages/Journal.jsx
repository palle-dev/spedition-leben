import React from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, euroSigned, formatEuro } from "@/lib/gameData";
import { BookOpen, Truck, Heart, Trophy, Package } from "lucide-react";

export default function Journal() {
  const { state } = useGame();
  const events = [];

  state.bookings.forEach(b => events.push({ min: b.min, icon: "euro", text: `${b.cause} [${b.account}]`, amount: b.amountCents }));
  state.trips.forEach(t => {
    if (t.status === "completed") events.push({ min: t.endMin, icon: "truck", text: `Fahrt ${t.id} abgeschlossen in ${t.legs[t.legs.length - 1].toCity}` });
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
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-display text-amber-200 flex items-center gap-2"><BookOpen className="w-6 h-6" /> Ereignisjournal</h1>
        <p className="text-amber-100/60 text-sm">Chronologischer Verlauf von Buchungen, Fahrten, Terminen und Meilensteinen.</p>
      </div>
      {recent.length === 0 ? <div className="text-sm text-amber-100/40">Noch keine Ereignisse.</div> : (
        <div className="space-y-1">
          {recent.map((e, i) => (
            <div key={i} className="text-sm flex items-center gap-3 border-b border-wood/10 py-1.5">
              <span className="text-amber-100/40 text-xs font-mono w-28 shrink-0">{formatGameTime(e.min)}</span>
              <IconFor kind={e.icon} />
              <span className="text-amber-100/80 flex-1">{e.text}</span>
              {e.amount != null && <span className={`font-mono ${e.amount >= 0 ? "text-emerald-300" : "text-red-300"}`}>{euroSigned(e.amount)}</span>}
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
  const cls = "w-4 h-4 shrink-0 text-amber-300/70";
  if (kind === "truck") return <Truck className={cls} />;
  if (kind === "heart") return <Heart className={cls} />;
  if (kind === "trophy") return <Trophy className={cls} />;
  if (kind === "package") return <Package className={cls} />;
  return <span className="text-amber-300/70">€</span>;
}