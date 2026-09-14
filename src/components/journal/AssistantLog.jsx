import React, { useMemo, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, formatEuro } from "@/lib/gameData";
import { Briefcase, TrendingDown, FileText, Lightbulb, Calculator, Package } from "lucide-react";

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
    const c = { all: 0, order_accepted: 0, cost_optimization: 0, accounting_task: 0, daily_report: 0, decision_proposal: 0 };
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
      <div className="glass border border-white/10 rounded-xl p-8 text-center">
        <Briefcase className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Noch keine Assistenten-Aktivität. Stelle einen Assistenten der Geschäftsführung ein,
          um automatisierte Aufgaben zu aktivieren.
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
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard icon={Package} label="Auto-angenommen" value={counts.order_accepted} color="text-lime" />
        <SummaryCard icon={TrendingDown} label="Gesparte Kosten/Tag" value={formatEuro(totalSaving)} color="text-coral" />
        <SummaryCard icon={Calculator} label="Buchhaltungs­vorbereitungen" value={counts.accounting_task} color="text-foreground" />
        <SummaryCard icon={Lightbulb} label="Entscheidungs­vorschläge" value={counts.decision_proposal} color="text-amber-300" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filter === f.id
                ? "bg-lime/15 border-lime/30 text-lime"
                : "bg-surface-2/50 border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            <f.icon className="w-3.5 h-3.5" /> {f.label}
            <span className="tabular-nums opacity-60">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="glass border border-white/10 rounded-xl divide-y divide-white/5">
        {log.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Keine Einträge für diesen Filter.</div>
        ) : (
          log.slice(0, 100).map(entry => <LogEntry key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }) {
  return (
    <div className="glass border border-white/10 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className={`text-lg font-medium tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function LogEntry({ entry }) {
  const d = entry.details || {};
  const time = formatGameTime(entry.gameTime);

  if (entry.type === "order_accepted") {
    return (
      <div className="flex items-start gap-3 px-4 py-3">
        <Package className="w-4 h-4 text-lime/70 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm">
            <span className="text-foreground">{entry.assistantName}</span>
            <span className="text-muted-foreground"> hat Auftrag von </span>
            <span className="text-foreground">{d.customer}</span>
            <span className="text-muted-foreground"> angenommen: </span>
            <span className="text-foreground">{d.fromCity} → {d.toCity}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
            <span className="tabular-nums">{formatEuro(d.paymentCents || 0)}</span>
            <span className="text-lime/70">Marge {d.marginPct}%</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground/50 tabular-nums shrink-0">{time}</span>
      </div>
    );
  }

  if (entry.type === "cost_optimization") {
    return (
      <div className="flex items-start gap-3 px-4 py-3">
        <TrendingDown className="w-4 h-4 text-coral/70 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm">
            <span className="text-muted-foreground">Standortkosten um </span>
            <span className="text-coral">{d.reductionPct}%</span>
            <span className="text-muted-foreground"> senken vorgeschlagen — </span>
            <span className="text-coral">{formatEuro(d.savingCents || 0)}</span>
            <span className="text-muted-foreground"> Ersparnis ({d.branchCount} Filialen)</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground/50 tabular-nums shrink-0">{time}</span>
      </div>
    );
  }

  if (entry.type === "accounting_task") {
    return (
      <div className="flex items-start gap-3 px-4 py-3">
        <Calculator className="w-4 h-4 text-foreground/50 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm">
            <span className="text-foreground">{entry.assistantName}</span>
            <span className="text-muted-foreground"> hat {d.taskCount} Buchhaltungsaufgabe(n) vorbereitet</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground/50 tabular-nums shrink-0">{time}</span>
      </div>
    );
  }

  if (entry.type === "daily_report") {
    return (
      <div className="flex items-start gap-3 px-4 py-3">
        <FileText className="w-4 h-4 text-foreground/50 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm">
            <span className="text-muted-foreground">Tagesbericht Tag {d.day} gesendet — </span>
            <span className="text-foreground tabular-nums">{formatEuro(d.revenue || 0)} Umsatz</span>
            <span className="text-muted-foreground">, {d.deliveriesToday} Lieferungen</span>
            <span className="text-muted-foreground">, {d.fleetFree} Lkw frei</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground/50 tabular-nums shrink-0">{time}</span>
      </div>
    );
  }

  if (entry.type === "decision_proposal") {
    return (
      <div className="flex items-start gap-3 px-4 py-3">
        <Lightbulb className="w-4 h-4 text-amber-300/70 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm">
            <span className="text-foreground font-medium">{d.title}</span>
            <span className="text-muted-foreground"> — {d.reasoning}</span>
          </div>
          <div className="text-xs text-amber-300/60 mt-0.5">→ {d.action}</div>
        </div>
        <span className="text-xs text-muted-foreground/50 tabular-nums shrink-0">{time}</span>
      </div>
    );
  }

  return null;
}