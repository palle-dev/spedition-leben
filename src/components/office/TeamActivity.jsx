import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTeamActivity } from "@/lib/officeData";
import { formatGameTime } from "@/lib/gameData";
import { Activity, ArrowRight } from "lucide-react";

const TYPE_LABELS = {
  order_accepted_by_dispatcher: "Auftrag angenommen",
  tour_planned_by_dispatcher: "Tour geplant",
  tour_started: "Tour gestartet",
  delivery_completed: "Lieferung",
  reward_available: "Belohnung frei",
  reward_claimed: "Belohnung abgeholt",
  purchase_completed: "Anschaffung",
  purchase_sold: "Verkauf",
  private_activity_started: "Aktivität",
};

const TYPE_ICONS = {
  order_accepted_by_dispatcher: "✓",
  tour_planned_by_dispatcher: "📋",
  tour_started: "🚛",
  delivery_completed: "📦",
  reward_available: "🎁",
  reward_claimed: "🎁",
  purchase_completed: "🏠",
  purchase_sold: "💰",
  private_activity_started: "☕",
};

// Aktivitätsstrom der Mitarbeiterarbeit.
export default function TeamActivity({ state }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const allActivity = getTeamActivity(state, 50);

  const filters = [
    { id: "all", label: "Alle" },
    { id: "dispatch", label: "Disposition" },
    { id: "delivery", label: "Lieferungen" },
    { id: "private", label: "Privat" },
  ];

  const filtered = filter === "all" ? allActivity :
    filter === "dispatch" ? allActivity.filter(e => ["order_accepted_by_dispatcher", "tour_planned_by_dispatcher", "tour_started"].includes(e.type)) :
    filter === "delivery" ? allActivity.filter(e => e.type === "delivery_completed") :
    filter === "private" ? allActivity.filter(e => ["reward_available", "reward_claimed", "purchase_completed", "purchase_sold", "private_activity_started"].includes(e.type)) :
    allActivity;

  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" /> Dein Team arbeitet
        </h3>
        <div className="flex gap-1">
          {filters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                filter === f.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-4">
          <div className="text-sm text-muted-foreground">Noch keine Aktivität.</div>
          <div className="text-[10px] text-muted-foreground/70 mt-1">Setze die Zeit fort, um Ereignisse zu sehen.</div>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto scrollbar-none">
          {filtered.map(ev => {
            const d = ev.details || {};
            return (
              <div key={ev.id} className="flex items-start gap-2 text-xs border-b border-white/5 pb-1.5 last:border-0">
                <span className="text-base shrink-0 leading-none mt-0.5">{TYPE_ICONS[ev.type] || "•"}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-foreground">
                    {ev.employeeName && <span className="font-medium">{ev.employeeName}: </span>}
                    <span>{TYPE_LABELS[ev.type] || ev.type}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                    {d.customer && `${d.customer} · `}
                    {d.fromCity && `${d.fromCity} → ${d.toCity} · `}
                    {d.name || ""}
                    {d.paymentCents ? ` ${formatGameTime(ev.gameTime)}` : ` ${formatGameTime(ev.gameTime)}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button onClick={() => navigate("/journal")}
        className="w-full mt-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition py-1.5">
        Vollständiges Journal <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}