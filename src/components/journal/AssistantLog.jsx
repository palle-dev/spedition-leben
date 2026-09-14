import React, { useMemo, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, formatEuro } from "@/lib/gameData";
import { Briefcase, TrendingDown, FileText, Lightbulb, Calculator, Package, Sparkles, Truck, AlertTriangle, Layers, GraduationCap } from "lucide-react";
import AssistantConfig from "./AssistantConfig";

// Übersicht aller automatisierten Aufgaben des Assistenten der Geschäftsführung.
export default function AssistantLog() {
  const { state } = useGame();
  const [filter, setFilter] = useState("all");

  const log = useMemo(() => {
    const entries = (state?.assistantLog || []).slice().reverse();
    if (filter === "all") return entries;
    return entries.filter(e => e.type === filter);
  }, [state?.assistantLog, filter]);

  const counts = useMemo(() => {
    const c = { all: 0, order_accepted: 0, cost_optimization: 0, accounting_task: 0, daily_report: 0, decision_proposal: 0, order_deadline_warning: 0, order_auto_dispatched: 0, order_backlog_warning: 0, training_booked: 0, fleet_utilization_warning: 0 };
    for (const e of state?.assistantLog || []) {
      c.all++;
      if (c[e.type] !== undefined) c[e.type]++;
    }
    return c;
  }, [state?.assistantLog]);

  const totalSaving = useMemo(() => {
    return (state?.assistantLog || [])
      .filter(e => e.type === "cost_optimization")
      .reduce((s, e) => s + (e.details?.savingCents || 0), 0);
  }, [state?.assistantLog]);

  if (counts.all === 0) {
    return (
      <div className="glass border border-white/10 rounded-xl p-12 text-center">
        <div className="grid place-items-center w-14 h-14 rounded-2xl bg-white/5 mx-auto mb-4">
          <Briefcase className="w-7 h-7 text-muted-foreground/30" />
        </div>
        <p className="text-sm text-muted-foreground">Noch keine Assistenten-Aktivität.</p>
        <p className="text-xs text-muted-foreground/50 mt-1">
          Stelle einen Assistenten der Geschäftsführung ein, um automatisierte Aufgaben zu aktivieren.
        </p>
      </div>
    );
  }

  const filters = [
    { id: "all", label: "Alle", icon: Briefcase, count: counts.all },
    { id: "order_accepted", label: "Aufträge", icon: Package, count: counts.order_accepted },
    { id: "cost_optimization", label: "Ersparnis", icon: TrendingDown, count: counts.cost_optimization },
    { id: "accounting_task", label: "Buchhaltung", icon: Calculator, count: counts.accounting_task },
    { id: "daily_report", label: "Berichte", icon: FileText, count: counts.daily_report },
    { id: "decision_proposal", label: "Vorschläge", icon: Lightbulb, count: counts.decision_proposal },
    { id: "order_auto_dispatched", label: "Dispo", icon: Truck, count: counts.order_auto_dispatched },
    { id: "order_deadline_warning", label: "Warnungen", icon: AlertTriangle, count: counts.order_deadline_warning },
    { id: "order_backlog_warning", label: "Rückstau", icon: Layers, count: counts.order_backlog_warning },
    { id: "training_booked", label: "Schulung", icon: GraduationCap, count: counts.training_booked },
    { id: "fleet_utilization_warning", label: "Flotte", icon: Truck, count: counts.fleet_utilization_warning },
  ];

  return (
    <div className="space-y-5">
      {/* Konfiguration */}
      <AssistantConfig />

      {/* Zusammenfassungs-Karten */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={Package} label="Auto-angenommen" value={counts.order_accepted} sub="Aufträge" color="text-lime" bg="bg-lime/10" />
        <SummaryCard icon={TrendingDown} label="Gesparte Kosten" value={formatEuro(totalSaving)} sub="pro Tag" color="text-coral" bg="bg-coral/10" />
        <SummaryCard icon={Calculator} label="Buchhaltung" value={counts.accounting_task} sub="Vorbereitungen" color="text-foreground" bg="bg-white/5" />
        <SummaryCard icon={Lightbulb} label="Vorschläge" value={counts.decision_proposal} sub="Entscheidungen" color="text-amber-300" bg="bg-amber-300/10" />
      </div>

      {/* Filter-Pills */}
      <div className="flex flex-wrap gap-1.5">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 ${
              filter === f.id
                ? "bg-lime/15 border-lime/30 text-lime"
                : "bg-surface-2/50 border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
            }`}
          >
            <f.icon className="w-3.5 h-3.5" />
            {f.label}
            <span className={`tabular-nums ${filter === f.id ? "text-lime/60" : "opacity-50"}`}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* Log-Einträge */}
      {log.length === 0 ? (
        <div className="glass border border-white/10 rounded-xl p-8 text-center">
          <Sparkles className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Keine Einträge für diesen Filter.</p>
        </div>
      ) : (
        <div className="glass border border-white/10 rounded-xl divide-y divide-white/5 overflow-hidden">
          {log.slice(0, 100).map(entry => <LogEntry key={entry.id} entry={entry} />)}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, color, bg }) {
  return (
    <div className="glass border border-white/10 rounded-xl p-3.5">
      <div className="flex items-center gap-2 mb-2">
        <span className={`grid place-items-center w-7 h-7 rounded-lg ${bg}`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className={`text-lg font-medium tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground/50 mt-0.5">{sub}</div>
    </div>
  );
}

function LogEntry({ entry }) {
  const d = entry.details || {};
  const time = formatGameTime(entry.gameTime);

  const configs = {
    order_accepted: { Icon: Package, bg: "bg-lime/10", color: "text-lime" },
    cost_optimization: { Icon: TrendingDown, bg: "bg-coral/10", color: "text-coral" },
    accounting_task: { Icon: Calculator, bg: "bg-white/5", color: "text-foreground/60" },
    daily_report: { Icon: FileText, bg: "bg-white/5", color: "text-foreground/60" },
    decision_proposal: { Icon: Lightbulb, bg: "bg-amber-300/10", color: "text-amber-300" },
    order_auto_dispatched: { Icon: Truck, bg: "bg-lime/10", color: "text-lime" },
    order_deadline_warning: { Icon: AlertTriangle, bg: "bg-amber-300/10", color: "text-amber-300" },
    order_backlog_warning: { Icon: Layers, bg: "bg-coral/10", color: "text-coral" },
    training_booked: { Icon: GraduationCap, bg: "bg-lime/10", color: "text-lime" },
    fleet_utilization_warning: { Icon: Truck, bg: "bg-amber-300/10", color: "text-amber-300" },
  };
  const cfg = configs[entry.type] || { Icon: Briefcase, bg: "bg-white/5", color: "text-foreground/60" };

  return (
    <div className="flex items-start gap-3 px-4 py-3.5 hover:bg-white/[0.02] transition-colors">
      <span className={`grid place-items-center w-7 h-7 rounded-lg shrink-0 mt-0.5 ${cfg.bg}`}>
        <cfg.Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
      </span>
      <div className="flex-1 min-w-0">
        <EntryContent type={entry.type} entry={entry} d={d} />
      </div>
      <span className="text-xs text-muted-foreground/40 tabular-nums shrink-0 mt-1">{time}</span>
    </div>
  );
}

function EntryContent({ type, entry, d }) {
  if (type === "order_accepted") {
    return (
      <>
        <div className="text-sm leading-snug">
          <span className="text-foreground font-medium">{entry.assistantName}</span>
          <span className="text-muted-foreground"> hat Auftrag von </span>
          <span className="text-foreground">{d.customer}</span>
          <span className="text-muted-foreground"> angenommen</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          <span className="text-foreground/70">{d.fromCity} → {d.toCity}</span>
          <span className="tabular-nums text-lime/80">{formatEuro(d.paymentCents || 0)}</span>
          <span className="text-lime/60">Marge {d.marginPct}%</span>
        </div>
      </>
    );
  }

  if (type === "cost_optimization") {
    return (
      <>
        <div className="text-sm leading-snug">
          <span className="text-muted-foreground">Standortkosten um </span>
          <span className="text-coral font-medium">{d.reductionPct}%</span>
          <span className="text-muted-foreground"> senken vorgeschlagen</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          <span className="text-coral/80 tabular-nums">{formatEuro(d.savingCents || 0)} Ersparnis</span>
          <span>{d.branchCount} Filialen betroffen</span>
        </div>
      </>
    );
  }

  if (type === "accounting_task") {
    return (
      <div className="text-sm leading-snug">
        <span className="text-foreground font-medium">{entry.assistantName}</span>
        <span className="text-muted-foreground"> hat </span>
        <span className="text-foreground tabular-nums">{d.taskCount}</span>
        <span className="text-muted-foreground"> Buchhaltungsaufgabe(n) vorbereitet</span>
      </div>
    );
  }

  if (type === "daily_report") {
    return (
      <>
        <div className="text-sm leading-snug">
          <span className="text-muted-foreground">Tagesbericht </span>
          <span className="text-foreground font-medium">Tag {d.day}</span>
          <span className="text-muted-foreground"> gesendet</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          <span className="text-lime/80 tabular-nums">{formatEuro(d.revenue || 0)} Umsatz</span>
          <span>{d.deliveriesToday} Lieferungen</span>
          <span>{d.fleetFree} Lkw frei</span>
        </div>
      </>
    );
  }

  if (type === "decision_proposal") {
    return (
      <>
        <div className="text-sm leading-snug">
          <span className="text-foreground font-medium">{d.title}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">{d.reasoning}</div>
        <div className="text-xs text-amber-300/70 mt-1 flex items-center gap-1">
          <span>→</span> {d.action}
        </div>
      </>
    );
  }

  if (type === "order_auto_dispatched") {
    return (
      <>
        <div className="text-sm leading-snug">
          <span className="text-foreground font-medium">{entry.assistantName}</span>
          <span className="text-muted-foreground"> hat Auftrag von </span>
          <span className="text-foreground">{d.customer}</span>
          <span className="text-muted-foreground"> automatisch disponiert</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          <span className="text-foreground/70">{d.fromCity} → {d.toCity}</span>
          <span className="text-lime/60">Tour erstellt</span>
        </div>
      </>
    );
  }

  if (type === "order_deadline_warning") {
    return (
      <>
        <div className="text-sm leading-snug">
          <span className="text-amber-300 font-medium">⚠️ Frist warnung: </span>
          <span className="text-foreground">{d.customer}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          <span className="text-foreground/70">{d.fromCity} → {d.toCity}</span>
          <span className="text-amber-300/80">noch {d.hoursLeft} Std bis Lieferfrist</span>
        </div>
      </>
    );
  }

  if (type === "order_backlog_warning") {
    return (
      <>
        <div className="text-sm leading-snug">
          <span className="text-coral font-medium">⚠️ Auftragsrückstau: </span>
          <span className="text-foreground tabular-nums">{d.backlogCount}</span>
          <span className="text-muted-foreground"> ungesplante Aufträge (Limit: {d.threshold})</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">{d.bottleneck}</div>
        <div className="text-xs text-coral/70 mt-1 flex items-center gap-1">
          <span>→</span> {d.suggestion}
        </div>
      </>
    );
  }

  if (type === "training_booked") {
    return (
      <>
        <div className="text-sm leading-snug">
          <span className="text-foreground font-medium">{d.personName}</span>
          <span className="text-muted-foreground"> für Kurs </span>
          <span className="text-foreground">{d.courseLabel}</span>
          <span className="text-muted-foreground"> angemeldet</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
          <span className="text-lime/80 tabular-nums">{formatEuro(d.feeCents || 0)} Gebühr</span>
        </div>
      </>
    );
  }

  if (type === "fleet_utilization_warning") {
    return (
      <>
        <div className="text-sm leading-snug">
          <span className="text-amber-300 font-medium">📉 Flottenauslastung: </span>
          <span className="text-foreground tabular-nums">{d.onTour}/{d.available}</span>
          <span className="text-muted-foreground"> Lkw auf Tour ({d.utilizationPct}%, Ziel: {d.thresholdPct}%)</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">{d.bottleneck}</div>
        <div className="text-xs text-amber-300/70 mt-1 flex items-center gap-1">
          <span>→</span> {d.suggestion}
        </div>
      </>
    );
  }

  return null;
}