import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, euroSigned, formatEuro } from "@/lib/gameData";
import { BookOpen, Truck, Heart, Trophy, Package, Euro, Briefcase, TrendingUp, TrendingDown, Calendar } from "lucide-react";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import AssistantLog from "@/components/journal/AssistantLog";

const EASE = [0.2, 0.75, 0.2, 1];

export default function Journal() {
  const { state } = useGame();
  const [tab, setTab] = useState("events");

  const events = useMemo(() => {
    const list = [];
    (state.bookings || []).forEach(b => list.push({
      min: b.min, kind: "euro",
      text: `${b.cause} (${b.account === "company" ? "Firma" : "Privat"})`,
      amount: b.amountCents,
    }));
    (state.trips || []).forEach(t => {
      if (t.status === "completed") {
        const v = (state.vehicles || []).find(x => x.id === t.vehicleId);
        const phases = t.phases || t.legs || [];
        const lastPhase = phases[phases.length - 1];
        list.push({ min: t.endMin, kind: "truck", text: `${vehicleDisplayName(v)} abgeschlossen in ${lastPhase?.toCity || "—"}` });
      }
    });
    (state.appointments || []).forEach(a => {
      if (a.status === "done") list.push({ min: a.endMin, kind: "heart", text: `Termin beendet: ${labelOf(a)}` });
      if (a.status === "missed") list.push({ min: a.decisionDeadline, kind: "heart", text: `Einladung verpasst: ${labelOf(a)}` });
      if (a.status === "declined") list.push({ min: a.appearMin, kind: "heart", text: `Einladung abgesagt: ${labelOf(a)}` });
    });
    (state.milestones || []).forEach(m => { if (m.achieved) list.push({ min: m.achievedAtMin, kind: "trophy", text: `Meilenstein erreicht: ${m.name}` }); });
    (state.orders || []).forEach(o => {
      if (o.status === "geliefert") list.push({ min: o.deliveredAtMin, kind: "package", text: `Geliefert: ${o.customer} (${o.fromCity} → ${o.toCity})` });
      if (o.status === "expired") list.push({ min: o.acceptDeadlineMin, kind: "package", text: `Angebot verfallen: ${o.customer}` });
    });
    list.sort((a, b) => b.min - a.min);
    return list;
  }, [state]);

  const recent = events.slice(0, 60);

  // Tagesgruppierung
  const grouped = useMemo(() => {
    const map = new Map();
    for (const e of recent) {
      const day = Math.floor(e.min / 1440) + 1;
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(e);
    }
    return Array.from(map.entries());
  }, [recent]);

  // Zusammenfassung
  const stats = useMemo(() => {
    const revenue = (state.bookings || []).filter(b => b.amountCents > 0).reduce((s, b) => s + b.amountCents, 0);
    const expenses = (state.bookings || []).filter(b => b.amountCents < 0).reduce((s, b) => s + Math.abs(b.amountCents), 0);
    const deliveries = (state.orders || []).filter(o => o.status === "geliefert").length;
    return { total: events.length, revenue, expenses, deliveries };
  }, [events, state]);

  const hasAssistantLog = (state?.assistantLog || []).length > 0;

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-medium tracking-tight flex items-center gap-2.5">
            <span className="grid place-items-center w-9 h-9 rounded-lg bg-lime/10 border border-lime/20">
              <BookOpen className="w-5 h-5 text-lime" />
            </span>
            Ereignisjournal
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 ml-12">Chronologischer Verlauf und Assistenten-Protokoll.</p>
        </div>
      </div>

      {/* Tab-Navigation */}
      <div className="flex gap-1 border-b border-white/10 -mx-1 px-1">
        <TabButton active={tab === "events"} onClick={() => setTab("events")} icon={BookOpen} label="Ereignisse" count={events.length} />
        <TabButton active={tab === "assistant"} onClick={() => setTab("assistant")} icon={Briefcase} label="Assistent" count={hasAssistantLog ? (state.assistantLog || []).length : null} />
      </div>

      {tab === "assistant" ? (
        <AssistantLog />
      ) : recent.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-5">
          {/* Zusammenfassungs-Statistiken */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={BookOpen} label="Ereignisse gesamt" value={stats.total} color="text-lime" />
            <StatCard icon={TrendingUp} label="Einnahmen" value={formatEuro(stats.revenue)} color="text-lime" />
            <StatCard icon={TrendingDown} label="Ausgaben" value={formatEuro(stats.expenses)} color="text-red-300" />
            <StatCard icon={Package} label="Lieferungen" value={stats.deliveries} color="text-foreground" />
          </div>

          {/* Tagesgruppierte Ereignisliste — zweispaltig auf breiten Bildschirmen */}
          <div className="grid lg:grid-cols-2 gap-5">
            {grouped.map(([day, items]) => (
              <div key={day} className="space-y-1">
                <div className="flex items-center gap-2.5 px-1 pb-1">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground/50" />
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">Tag {day}</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
                <div className="glass border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden">
                  {items.map((e, i) => (
                    <EventRow key={i} event={e} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all duration-200 ${active ? "border-lime text-lime" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      <Icon className="w-4 h-4" />
      {label}
      {count != null && count > 0 && (
        <span className={`tabular-nums text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-lime/15 text-lime" : "bg-white/5 text-muted-foreground"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="glass border border-white/10 rounded-xl p-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className={`text-lg font-medium tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function EventRow({ event }) {
  const icons = {
    truck: { Icon: Truck, cls: "bg-lime/10 text-lime" },
    heart: { Icon: Heart, cls: "bg-coral/10 text-coral" },
    trophy: { Icon: Trophy, cls: "bg-amber-300/10 text-amber-300" },
    package: { Icon: Package, cls: "bg-white/5 text-foreground/60" },
    euro: { Icon: Euro, cls: "bg-lime/10 text-lime/70" },
  };
  const { Icon, cls } = icons[event.kind] || icons.euro;
  const positive = event.amount != null && event.amount >= 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
      <span className="text-muted-foreground/40 text-xs tabular-nums w-20 shrink-0">{formatGameTime(event.min).split(", ")[1]}</span>
      <span className={`grid place-items-center w-7 h-7 rounded-lg shrink-0 ${cls}`}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <span className="text-foreground/80 flex-1 text-sm leading-snug">{event.text}</span>
      {event.amount != null && (
        <span className={`tabular-nums text-sm font-medium shrink-0 ${positive ? "text-lime" : "text-red-300"}`}>
          {euroSigned(event.amount)}
        </span>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass border border-white/10 rounded-xl p-12 text-center">
      <div className="grid place-items-center w-14 h-14 rounded-2xl bg-white/5 mx-auto mb-4">
        <BookOpen className="w-7 h-7 text-muted-foreground/30" />
      </div>
      <p className="text-sm text-muted-foreground">Noch keine Ereignisse protokolliert.</p>
      <p className="text-xs text-muted-foreground/50 mt-1">Sobald Aufträge angenommen, Touren geplant oder Buchungen getätigt werden, erscheinen sie hier.</p>
    </div>
  );
}

function labelOf(a) {
  if (a.type === "invitation") return "Freizeitabend";
  if (a.type === "invitation_ersatz") return "Ersatztermin";
  if (a.type === "leisure") return a.label || "Freizeit";
  return "Termin";
}