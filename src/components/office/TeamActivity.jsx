import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getTeamActivity } from "@/lib/officeData";
import { formatGameTime } from "@/lib/gameData";
import { Activity, ArrowRight, Truck, Package, Gift, Home, Coffee, CheckCircle2, ClipboardList } from "lucide-react";

const TYPE_CONFIG = {
  order_accepted_by_dispatcher: { label: "Auftrag angenommen", icon: CheckCircle2, color: "text-lime" },
  tour_planned_by_dispatcher: { label: "Tour geplant", icon: ClipboardList, color: "text-sky-300" },
  tour_started: { label: "Tour gestartet", icon: Truck, color: "text-amber-300" },
  delivery_completed: { label: "Lieferung abgeschlossen", icon: Package, color: "text-lime" },
  reward_available: { label: "Belohnung verfügbar", icon: Gift, color: "text-coral" },
  reward_claimed: { label: "Belohnung abgeholt", icon: Gift, color: "text-coral" },
  purchase_completed: { label: "Anschaffung getätigt", icon: Home, color: "text-violet-300" },
  purchase_sold: { label: "Verkauf", icon: Home, color: "text-violet-300" },
  private_activity_started: { label: "Privataktivität", icon: Coffee, color: "text-coral" },
};

// Aktivitätsstrom mit Lucide-Icons und klarer Typ-Kennzeichnung.
export default function TeamActivity({ state }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const allActivity = getTeamActivity(state, 40);

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
    <div className="glass border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
          <Activity className="w-4 h-4 text-lime/70" /> Betriebsaktivität
        </h3>
        <div className="flex gap-1">
          {filters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-2.5 py-1 rounded text-[10px] font-medium transition ${
                filter === f.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-sm text-muted-foreground/70">Noch keine Aktivität.</div>
          <div className="text-[10px] text-muted-foreground/50 mt-1">Setze die Zeit fort, um Ereignisse zu sehen.</div>
        </div>
      ) : (
        <div className="space-y-0 max-h-[280px] overflow-y-auto scrollbar-none -mr-1 pr-1">
          {filtered.map((ev, i) => {
            const cfg = TYPE_CONFIG[ev.type] || { label: ev.type, icon: Activity, color: "text-muted-foreground" };
            const Icon = cfg.icon;
            const d = ev.details || {};
            return (
              <div key={ev.id} className="flex items-start gap-2.5 py-2 border-b border-white/5 last:border-0">
                <Icon className={`w-3.5 h-3.5 ${cfg.color} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-foreground/90">
                    {ev.employeeName && <span className="font-medium">{ev.employeeName}: </span>}
                    <span className="text-muted-foreground">{cfg.label}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">
                    {d.customer && `${d.customer} · `}
                    {d.fromCity && `${d.fromCity} → ${d.toCity}`}
                    {d.name && d.name}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground/40 shrink-0 tabular-nums mt-0.5">
                  {formatGameTime(ev.gameTime)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <button onClick={() => navigate("/journal")}
        className="w-full mt-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition py-1.5 border-t border-white/5">
        Vollständiges Journal <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}